import { Canvas } from 'canvas';
import { execSync } from 'child_process';
import fs from 'fs';
import { platform } from 'os';
import { CameraModel } from '../webapp/src/Configs/Camera/Model';
import { elapsed, getHistogram, getHistogramInRc, getMeanBrightness } from '../webapp/src/Configs/Utils';
import { CameraPlugin } from './Plugin';
import { testAssert } from './Utils';

export abstract class ExposureAdjustingCamera implements CameraPlugin {
  private _currentUs;
  private _currentIso;
  
  private MIN_ISO;
  private MAX_ISO;
  private MIN_EXPOSURE_US;
  private MAX_EXPOSURE_US;
  private PREFERRED_EXPOSURE_US;
  private ADJUST_RATE = 2.75;
  private lastWasExtreme:boolean = false; // was our last bright/dark adjustment really extreme?  if so, don't do two in a row
  

  constructor() {
  }
  protected abstract getActualShutterSettingsFor(us:number, iso:number):{us:number, iso:number, internal:any};
  protected abstract takePhotoExposureControlled(targetUs:number, targetIso:number, cameraModel: CameraModel): Promise<Buffer>;



  // implement these!
  takePhoto(cameraModel: CameraModel): Promise<Buffer> {
    return this.takePhotoExposureControlled(this._currentUs, this._currentIso, cameraModel);
  }

  protected initExposureControl(preferredExposureUs:number, minExposureUs:number, maxExposureUs:number, minIso:number, maxIso:number) {
    testAssert(minExposureUs < maxExposureUs);
    testAssert(minIso < maxIso);
    testAssert(preferredExposureUs >= minExposureUs && preferredExposureUs <= maxExposureUs);


    this.MIN_EXPOSURE_US = minExposureUs;
    this.MAX_EXPOSURE_US = maxExposureUs;

    this.MIN_ISO = minIso;
    this.MAX_ISO = maxIso;
    
    this.PREFERRED_EXPOSURE_US = preferredExposureUs;

    
    const currentHour = new Date().getHours() + (new Date().getMinutes()/60);

    // dayCycle will be 1.0 at local midnight, 0.0 at noon, assuming the pi's clock is set right.
    const dayCycle = Math.pow((Math.cos(currentHour*2*Math.PI / 24) + 1)/2, 4);

    // minIsoEquivMaxExposure represents 2-second, 800-iso exposures as what they'd be as a ISO100 shot.  Then we're going to run checkExposureBounds to get everything back hunky-dory
    // so at midnight we should really be starting at 16-second iso100 equivalents, so startingUs is going to get calculated as that.  Then it'll be 8-second, ISO200, 4-second ISO400, and finally 2-second ISO800
    const minIsoEquivMaxExposure = this.MAX_EXPOSURE_US * (this.MAX_ISO / this.MIN_ISO);


    // this will give us startUs = (really long exposure) at midnight, (really short exposure) at noon.
    const startingUs = dayCycle * minIsoEquivMaxExposure + (1-dayCycle)*this.MIN_EXPOSURE_US;


    this._currentUs = startingUs;
    
    // adjust ISOs and currentUs so that we get back under preferred exposure
    for(var x = 0; x < (this.MAX_ISO / this.MIN_ISO); x++) {
      this.checkExposureBounds();
      console.log(`Starting exposure: ${(this._currentUs/1000).toFixed(2)}ms @ iso ${this._currentIso}`);
    }
    this.checkExposureBounds();

    this._currentIso = this.MIN_ISO; // start at 100iso because that's what minIsoEquivMaxExposure is assuming
    
  }

  async analyzeRawImage(cameraModel:CameraModel, image:Canvas):Promise<void> {

    const peakHistoBrightness = 256;

    let basicStats:{mean:number, histo:number[]}|null = null;
    if(cameraModel.rcExposure) {
      basicStats = getMeanBrightness(image, (canvas) => getHistogramInRc(canvas, cameraModel.rcExposure));
    } else {
      basicStats = getMeanBrightness(image, getHistogram);
    }
    
    const mean = basicStats.mean;
    const targetMean = cameraModel.targetedMeanBrightness || (0.55 * peakHistoBrightness);
    const multiplyToGetToTarget = targetMean / mean;

    console.log(elapsed(), "Mean brightness: ", mean, " target: ", targetMean);

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
  
  brighter(limitMultiply) {
    // we need to take into account the rolling shutter interval time.  We can only expose in multiples of 20us, apparently.
    // otherwise what can happen is:
    // [currentUs=51us -> rounds to 60us -> too bright] -> [adjusts to 49us -> rounds to 40us -> waaaay darker -> gets adjusted to 51us] -> rounds to 60us -> waaay brighter.
    // so we end up with this weird visual oscillation as the "perfect" exposure transitions through these zones causing us to bounce between too bright and too dark

    // the current fix says: "if your currentUs is 49, it rounds to 40us.  In order to jump to 60us, you need to require a brightness increase sufficient to go from 40us to 51us (+25%), not just from 49us to 51us (+4%)"
    const tookUs = this.getActualShutterSettingsFor(this._currentUs, this._currentIso).us;
    this._currentUs = tookUs * Math.min(this.ADJUST_RATE, limitMultiply);

    this.checkExposureBounds();
  }
  darker(limitMultiply) {
    // see comment in brighter();
    const tookUs = this.getActualShutterSettingsFor(this._currentUs, this._currentIso).us;
    this._currentUs = tookUs * Math.max(limitMultiply, (1 / this.ADJUST_RATE));
    this.checkExposureBounds();
  }
  wayDarker(multiply) {
    this._currentUs *= multiply;
    this.checkExposureBounds();
  }
  wayBrighter(multiply) {
    this._currentUs *= multiply;
    this.checkExposureBounds();
  }
  private checkExposureBounds() {
    if(this._currentUs > this.PREFERRED_EXPOSURE_US) {
      // hmm, we're getting to a pretty long exposure here...
      // let's step up the ISO
      if(this._currentIso < this.MAX_ISO) {
        this._currentUs /= 2;
        this._currentIso *= 2;
      } else {
        // we're maxed out on ISO too?  We can keep running up to MAX_EXPOSURE_US I guess
        if(this._currentUs >= this.MAX_EXPOSURE_US) {
          this._currentUs = this.MAX_EXPOSURE_US;
          this._currentIso = this.MAX_ISO;
        } else {
          // this is fine.  Stuff's going to get grainy, but we can support it.
        }
      }
    } else if(this._currentUs < this.MIN_EXPOSURE_US) {
      // below minimum exposure time.  Let's step down ISO
      if(this._currentIso > this.MIN_ISO) {
        // we still have some ISO room
        this._currentIso /= 2;
        this._currentUs *= 2;
      } else {
        // we're taking them as short and as insensitive as we can...
        this._currentIso = this.MIN_ISO;
        this._currentUs = this.MIN_EXPOSURE_US;
      }
    }

  }

}

export function readFromCamera(file:string, resolve:(buf:Buffer)=>void, reject:(err:any)=>void) {
  fs.readFile(file, (err, data:Buffer) => {
    if(err) {
      console.error("Error reading from-camera.jpg: ", err);
      reject(err);
    }

    try{
      fs.unlink(file, () => {})
    } catch(e) {}

    resolve(data);
  });

}

let g_isPowerfulPi = undefined;
export function isPowerfulPi() {
  if(platform() === 'win32') {
    console.log("we're on windows, so we're powerful");
    return true;
  }
  if(g_isPowerfulPi === undefined) {
    // haven't figured it out yet
    const ex = execSync('cat /sys/firmware/devicetree/base/model');
    const res = ex.toString();
    if(res.includes('Raspberry Pi 4')) {
      g_isPowerfulPi = true;
    } else {
      g_isPowerfulPi = false;
    }
  } else {
    // have figured this out in the past
    console.log("is powerful pi? ", g_isPowerfulPi);
    return g_isPowerfulPi;
  }
}