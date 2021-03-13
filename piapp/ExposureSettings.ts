import {Raspistill} from 'node-raspistill';
import {Image as ImageJs} from 'image-js';
import {dassert, elapsed} from './Utils';
import { IMAGE_SUBMISSION_HEIGHT, IMAGE_SUBMISSION_WIDTH } from '../types/http';
import fs from 'fs';
import { exec, execSync, spawnSync } from 'child_process';
import { rejects } from 'assert';
import { ImageEffects } from './ImageEffects';


function roundToShutterMultiple(us:number) {
  return (Math.floor(us / 20)*20)
}

enum ConnectedCamera {
  RaspiV1, // note: not tested
  RaspiV2,
  Fswebcam,
  RaspiHQ,
}

export class ExposureSettings {
  currentUs = 100000;
  currentIso = 100;
  imagesTaken = 0;
  lastWasExtreme = false;

  myCamera:ConnectedCamera;

  // the camera can actually go longer and shorter than these bounds, I just don't want it to get too blurry
  MAX_EXPOSURE_US = 3999980; // 10s, max exposure for the v2 camera
  PREFERRED_EXPOSURE_US = 1000*1000; // "preferred" exposure is used so that we use more ISO instead of more exposure time, until we're capped out on ISO
  MIN_EXPOSURE_US = 60; // 1/10000s

  DEFAULT_ISO = 100;

  ADJUST_RATE = 2.75;

  // these appear to be the actual capabilities of the camera
  MAX_ISO = 800;
  MIN_ISO = 100;

  constructor() {
    const currentHour = new Date().getHours() + (new Date().getMinutes()/60);

    // dayCycle will be 1.0 at local midnight, 0.0 at noon, assuming the pi's clock is set right.
    const dayCycle = Math.pow((Math.cos(currentHour*2*Math.PI / 24) + 1)/2, 4);

    // minIsoEquivMaxExposure represents 2-second, 800-iso exposures as what they'd be as a ISO100 shot.  Then we're going to run checkExposureBounds to get everything back hunky-dory
    // so at midnight we should really be starting at 16-second iso100 equivalents, so startingUs is going to get calculated as that.  Then it'll be 8-second, ISO200, 4-second ISO400, and finally 2-second ISO800
    const minIsoEquivMaxExposure = this.MAX_EXPOSURE_US * (this.MAX_ISO / this.MIN_ISO);


    // this will give us startUs = (really long exposure) at midnight, (really short exposure) at noon.
    const startingUs = dayCycle * minIsoEquivMaxExposure + (1-dayCycle)*this.MIN_EXPOSURE_US;


    this.currentUs = startingUs;
    
    // adjust ISOs and currentUs so that we get back under preferred exposure
    for(var x = 0; x < (this.MAX_ISO / this.MIN_ISO); x++) {
      this.checkExposureBounds();
      console.log(`Starting exposure: ${(this.currentUs/1000).toFixed(2)}ms @ iso ${this.currentIso}`);
    }
    this.checkExposureBounds();

    this.currentIso = this.MIN_ISO; // start at 100iso because that's what minIsoEquivMaxExposure is assuming
    
    // we need to figure out which camera we've got installed, which will affect our settings
    
    this.myCamera = ConnectedCamera.RaspiV2; // just assume v2
    const v4l2 = execSync(`v4l2-ctl --list-framesizes=YU12`);
    const stdout = v4l2.toString();
    console.log("v4 stdout: ", stdout);
    if(stdout.includes('2592x1944')) {
      this.myCamera = ConnectedCamera.RaspiV1;
      this.MAX_EXPOSURE_US = 3999999;
    } else if(stdout.includes('3280x2464')) {
      this.myCamera = ConnectedCamera.RaspiV2;
      this.MAX_EXPOSURE_US = 8000000; // make sure that you've got your raspistill fully updated if this doesn't work.
    } else if(stdout.includes('4056x3040')) {
      this.myCamera = ConnectedCamera.RaspiHQ;
      this.MAX_EXPOSURE_US = 230 * 1000000; // 230 seconds!  wow!
    }


  }

  brighter(limitMultiply) {
    // we need to take into account the rolling shutter interval time.  We can only expose in multiples of 20us, apparently.
    // otherwise what can happen is:
    // [currentUs=51us -> rounds to 60us -> too bright] -> [adjusts to 49us -> rounds to 40us -> waaaay darker -> gets adjusted to 51us] -> rounds to 60us -> waaay brighter.
    // so we end up with this weird visual oscillation as the "perfect" exposure transitions through these zones causing us to bounce between too bright and too dark

    // the current fix says: "if your currentUs is 49, it rounds to 40us.  In order to jump to 60us, you need to require a brightness increase sufficient to go from 40us to 51us (+25%), not just from 49us to 51us (+4%)"
    const tookUs = roundToShutterMultiple(this.currentUs);
    this.currentUs = tookUs * Math.min(this.ADJUST_RATE, limitMultiply);

    this.checkExposureBounds();
  }
  darker(limitMultiply) {
    // see comment in brighter();
    const tookUs = roundToShutterMultiple(this.currentUs);
    this.currentUs = tookUs * Math.max(limitMultiply, (1 / this.ADJUST_RATE));
    this.checkExposureBounds();
  }
  wayDarker(multiply) {
    this.currentUs *= multiply;
    this.checkExposureBounds();
  }
  wayBrighter(multiply) {
    this.currentUs *= multiply;
    this.checkExposureBounds();
  }
  private checkExposureBounds() {
    if(this.currentUs > this.PREFERRED_EXPOSURE_US) {
      // hmm, we're getting to a pretty long exposure here...
      // let's step up the ISO
      if(this.currentIso < this.MAX_ISO) {
        this.currentUs /= 2;
        this.currentIso *= 2;
      } else {
        // we're maxed out on ISO too?  We can keep running up to MAX_EXPOSURE_US I guess
        if(this.currentUs >= this.MAX_EXPOSURE_US) {
          this.currentUs = this.MAX_EXPOSURE_US;
          this.currentIso = this.MAX_ISO;
        } else {
          // this is fine.  Stuff's going to get grainy, but we can support it.
        }
      }
    } else if(this.currentUs < this.MIN_EXPOSURE_US) {
      // below minimum exposure time.  Let's step down ISO
      if(this.currentIso > this.MIN_ISO) {
        // we still have some ISO room
        this.currentIso /= 2;
        this.currentUs *= 2;
      } else {
        // we're taking them as short and as insensitive as we can...
        this.currentIso = this.MIN_ISO;
        this.currentUs = this.MIN_EXPOSURE_US;
      }
    }

  }

  takePhoto():Promise<Buffer> {
    const exposeUs = roundToShutterMultiple(this.currentUs);
    console.log(elapsed(), "takePhoto() " + (exposeUs/1000).toFixed(2) + "ms @ " + this.currentIso + " ISO");
    // --timeout 1 comes from: https://www.raspberrypi.org/forums/viewtopic.php?t=203229
    console.log(elapsed(), "about to take picture");

    return new Promise((resolve, reject) => {
      const cameraCommand = `raspistill --timeout 1 -awb sun -ISO ${this.currentIso} -ss ${exposeUs} -w 1640 -h 1232 -bm -drc off -ex off -md 4 -n -o ./tmp/from-camera.jpg`;
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

  async analyzeRawImage(image:ImageJs) {
    console.log(elapsed(), "image straight outta camera was ", image.width, " x ", image.height);

    //const savePath = `./tmp/test-${this.imagesTaken}-${(this.currentUs/1000).toFixed(0)}ms.jpg`;
    //fs.writeFile(savePath, imageBuffer, () => {});
    
    //console.log("saved to ", savePath);
    //image.save(savePath, {format: 'jpg'});

    const peakHistoBrightness = 256;
    const basicStats = ImageEffects.getMeanBrightness(peakHistoBrightness, image);
    
    const mean = basicStats.mean;
    const targetMean = peakHistoBrightness / 2;
    const multiplyToGetToTarget = targetMean / mean;

    if(mean >= peakHistoBrightness*0.97 && !this.lastWasExtreme) {
      this.wayDarker(0.05);
      this.lastWasExtreme = true;
    } else if(mean < peakHistoBrightness*0.03 && !this.lastWasExtreme) {
      this.wayBrighter(20);
      this.lastWasExtreme = true;
    } else if(mean < targetMean) {
      this.brighter(multiplyToGetToTarget);
      this.lastWasExtreme = false;
    } else if(mean > targetMean) {
      this.darker(multiplyToGetToTarget);
      this.lastWasExtreme = false;
    }
  }
}
