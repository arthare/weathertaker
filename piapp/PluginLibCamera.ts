import {Raspistill} from 'node-raspistill';
import {Image as ImageJs} from 'image-js';
import fs from 'fs';
import { exec, execSync, spawnSync } from 'child_process';
import { rejects } from 'assert';
import { elapsed, ImageEffects } from '../webapp/src/Configs/Utils';
import { Canvas } from 'canvas';
import {CameraPlugin} from './Plugin';
import { ExposureAdjustingCamera } from './PluginUtils';
import { CameraModel } from '../webapp/src/Configs/Camera/Model';


function roundToShutterMultiple(us:number, fix60Hz:boolean) {
  if(fix60Hz) {
    return Math.max(16666, (Math.floor(us / 16666)*16666));
  } else {
    return Math.max(20, Math.floor(us / 20)*20);
  }
}

export class LibCameraPlugin extends ExposureAdjustingCamera implements CameraPlugin {
  imagesTaken = 0;

  lastSettings:any = null;

  // the camera can actually go longer and shorter than these bounds, I just don't want it to get too blurry
  private _maxExposureUs = 80000000; // 8s for the v2 camera once you install the better raspistill
  private _preferredExposureUs = 1000*1000; // "preferred" exposure is used so that we use more ISO instead of more exposure time, until we're capped out on ISO
  private _minExposureUs = 33333; // 1/30 of second (trying to avoid flicker)

  // these appear to be the actual capabilities of the camera
  private _maxIso = 800;
  private _minIso = 1;

  constructor() {
    super();
    
    // we need to figure out which camera we've got installed, which will affect our settings
    
    this.initExposureControl(this._preferredExposureUs, this._minExposureUs, this._maxExposureUs, this._minIso, this._maxIso);

    try {
      const lastExposure:any = fs.readFileSync('./last-exposure.json', 'utf8');
      const tmNow = new Date().getTime();
      if(tmNow - lastExposure.tmNow < 20 * 60000) {
        console.log("Been less than 10 minutes since our last exposure, so let's use this data ", lastExposure);
        for(var key in lastExposure) {
          if(typeof(lastExposure[key]) === 'number') {
            this[key] = lastExposure[key];
          }
        }

      }
    } catch(e) {
      // this is totally fine!
    }
    
  }

  static available() {
    const ret = spawnSync('raspistill', []);

    try {
      const ret = spawnSync(`libcamera-hello`, [`--list-cameras`]);
      const str = ret.stderr.toString();
      console.log("libcamera-still list-cameras said: ", str);
      return str.includes('imx477');
    } catch(e) {
      return false;
    }
    return !ret.error;
  }

  protected getActualShutterSettingsFor(us: number, iso: number): { us: number; iso: number; internal: any; } {
    return {
      iso,
      us: roundToShutterMultiple(us),
      internal: null,
    }
  }

  takePhotoExposureControlled(targetUs:number, targetIso:number, cameraModel:CameraModel):Promise<Buffer> {

    const originalTargetedExposure = targetUs * targetIso;
    const exposeUs = roundToShutterMultiple(targetUs, cameraModel.fix60hz);
    const achievedExposure = exposeUs * targetIso; // so let's say that we had to round to 1 second, but they'd asked for 1.2s @ ISO 400.  This means we gotta bump our ISO up slightly to compensate
    const achievedRatio = achievedExposure / originalTargetedExposure; // in the "achieved 1s after asked for 1.2s" situation, this will be 0.833.  We will want to bump out ISO
    targetIso /= achievedRatio;

    console.log(elapsed(), "takePhoto() " + (exposeUs/1000).toFixed(2) + "ms @ " + targetIso + " ISO" + " adjusted to " + targetIso);
    // --timeout 1 comes from: https://www.raspberrypi.org/forums/viewtopic.php?t=203229

    let saveThis:any = {};
    for(var key in this) {
      if(typeof(this[key]) === 'number') {
        saveThis[key] = this[key];
      }
    }
    saveThis.tmNow = new Date().getTime();
    fs.writeFileSync('./last-exposure.json', JSON.stringify(saveThis));

    return new Promise((resolve, reject) => {
      const cameraCommand = `libcamera-still --gain ${(targetIso / 40).toFixed(2)} --immediate -o ./tmp/from-camera.jpg --shutter ${exposeUs} --width 1640 --height 1232 -n`;
      console.log("running camera command ", cameraCommand);
      exec(cameraCommand, (err, stdout, stderr) => {
        if(err) {
          return reject(err);
        }
  
        //execSync(`convert ./tmp/from-camera.jpg -resize ${IMAGE_SUBMISSION_WIDTH}x${IMAGE_SUBMISSION_HEIGHT} -quality 99% ./tmp/922p.jpg`);
        //console.log(elapsed(), "done writing to disk");
        fs.readFile('./tmp/from-camera.jpg', (err, data:Buffer) => {
          if(err) {
            return reject(err);
          } else {
            console.log(elapsed(), `read ./tmp/from-camera.jpg with ${data.byteLength} bytes`);
            resolve(data);
          }
          
        });
  
      });
    })
  }

}
