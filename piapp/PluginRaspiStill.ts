import {Raspistill} from 'node-raspistill';
import {Image as ImageJs} from 'image-js';
import fs from 'fs';
import { exec, execSync, spawnSync } from 'child_process';
import { rejects } from 'assert';
import { ImageEffects } from '../webapp/src/Configs/Utils';
import { elapsed, getMeanBrightness } from '../webapp/src/Configs/Utils';
import { Canvas } from 'canvas';
import {CameraPlugin} from './Plugin';
import { ExposureAdjustingCamera } from './PluginUtils';
import { CameraModel } from '../webapp/src/Configs/Camera/Model';


function roundToShutterMultiple(us:number) {
  return (Math.floor(us / 20)*20)
}

enum ConnectedCamera {
  RaspiV1, // note: not tested
  RaspiV2,
  RaspiHQ,
}

export class RaspiStill extends ExposureAdjustingCamera implements CameraPlugin {
  imagesTaken = 0;

  lastSettings:any = null;
  myCamera:ConnectedCamera;
  myMode = 4;

  // the camera can actually go longer and shorter than these bounds, I just don't want it to get too blurry
  private _maxExposureUs = 8000000; // 8s for the v2 camera once you install the better raspistill
  private _preferredExposureUs = 1000*1000; // "preferred" exposure is used so that we use more ISO instead of more exposure time, until we're capped out on ISO
  private _minExposureUs = 20; // 1/10000s

  // these appear to be the actual capabilities of the camera
  private _maxIso = 800;
  private _minIso = 100;

  constructor() {
    super();
    
    // we need to figure out which camera we've got installed, which will affect our settings
    
    this.myCamera = ConnectedCamera.RaspiV2; // just assume v2
    const v4l2 = execSync(`v4l2-ctl --list-framesizes=YU12`);
    const stdout = v4l2.toString();
    console.log("v4 stdout: ", stdout);
    if(stdout.includes('2592x1944')) {
      console.log("We're a raspi v1!");
      this.myCamera = ConnectedCamera.RaspiV1;
      this._maxExposureUs = 3999999;
    } else if(stdout.includes('3280x2464')) {
      console.log("We're a raspi v2!");
      this.myCamera = ConnectedCamera.RaspiV2;
      this._maxExposureUs = 8000000; // make sure that you've got your raspistill fully updated if this doesn't work.
    } else if(stdout.includes('4056x3040')) {
      console.log("We're a raspi HQ!");
      this.myCamera = ConnectedCamera.RaspiHQ;
      this.myMode = 3; // empirical testing seems to indicate the HQ only wants to stretch to the really long exposures when in mode 3
      this._maxExposureUs = 22.5 * 1000000; // empirically, I like it better if it's limited to 22.5 seconds - the bigger lens available on the HQ camera means we collect a lot of light.
    } else {
      console.log("We can't identify our camera type from " + stdout);
    }

    this.initExposureControl(this._preferredExposureUs, this._minExposureUs, this._maxExposureUs, this._minIso, this._maxIso);

    try {
      const lastExposure:any = fs.readFileSync('./last-exposure.json', 'utf8');
      const tmNow = new Date().getTime();
      if(tmNow - lastExposure.tmNow < 10 * 60000) {
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
    const exposeUs = roundToShutterMultiple(targetUs);
    console.log(elapsed(), "takePhoto() " + (exposeUs/1000).toFixed(2) + "ms @ " + targetIso + " ISO");
    // --timeout 1 comes from: https://www.raspberrypi.org/forums/viewtopic.php?t=203229
    console.log(elapsed(), "about to take picture");

    let saveThis:any = {};
    for(var key in this) {
      if(typeof(this[key]) === 'number') {
        saveThis[key] = this[key];
      }
    }
    saveThis.tmNow = new Date().getTime();
    fs.writeFileSync('./last-exposure.json', JSON.stringify(saveThis));

    return new Promise((resolve, reject) => {
      const cameraCommand = `raspistill --timeout 1 -awb sun -ISO ${targetIso} -ss ${exposeUs} -w 1640 -h 1232 -bm -drc off -ex off -md ${this.myMode} -n -o ./tmp/from-camera.jpg`;
      console.log("running camera command ", cameraCommand);
      exec(cameraCommand, (err, stdout, stderr) => {
        if(err) {
          return reject(err);
        }
        console.log(elapsed(), "took picture");
  
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
  setupCamera(raspiCamera:Raspistill) {
    //console.log(elapsed(), "set camera to expose for " + (exposeUs/1000).toFixed(2) + "ms @ " + this.currentIso + " ISO");
    //raspiCamera.setOptions();
  }

}
