import {Raspistill} from 'node-raspistill';
import {Image as ImageJs} from 'image-js';
import {dassert, elapsed} from './Utils';
import { IMAGE_SUBMISSION_HEIGHT, IMAGE_SUBMISSION_WIDTH } from '../types/http';
import fs from 'fs';
import { execSync } from 'child_process';

// the camera can actually go longer and shorter than these bounds, I just don't want it to get too blurry
const MAX_EXPOSURE_US = 3999980; // 10s, max exposure for the v2 camera
const PREFERRED_EXPOSURE_US = 1000*1000; // "preferred" exposure is used so that we use more ISO instead of more exposure time, until we're capped out on ISO
const MIN_EXPOSURE_US = 60; // 1/10000s

const DEFAULT_ISO = 100;

const ADJUST_RATE = 2.75;

// these appear to be the actual capabilities of the camera
const MAX_ISO = 800;
const MIN_ISO = 100;

function roundToShutterMultiple(us:number) {
  return (Math.floor(us / 20)*20)
}

export class ExposureSettings {
  currentUs = 100000;
  currentIso = 100;
  imagesTaken = 0;
  lastWasExtreme = false;

  constructor() {
    const currentHour = new Date().getHours() + (new Date().getMinutes()/60);

    // dayCycle will be 1.0 at local midnight, 0.0 at noon, assuming the pi's clock is set right.
    const dayCycle = Math.pow((Math.cos(currentHour*2*Math.PI / 24) + 1)/2, 4);

    // minIsoEquivMaxExposure represents 2-second, 800-iso exposures as what they'd be as a ISO100 shot.  Then we're going to run checkExposureBounds to get everything back hunky-dory
    // so at midnight we should really be starting at 16-second iso100 equivalents, so startingUs is going to get calculated as that.  Then it'll be 8-second, ISO200, 4-second ISO400, and finally 2-second ISO800
    const minIsoEquivMaxExposure = MAX_EXPOSURE_US * (MAX_ISO / MIN_ISO);


    // this will give us startUs = (really long exposure) at midnight, (really short exposure) at noon.
    const startingUs = dayCycle * minIsoEquivMaxExposure + (1-dayCycle)*MIN_EXPOSURE_US;


    this.currentUs = startingUs; // 100ms, 1/10 second
    this.currentIso = MIN_ISO; // start at 100iso because that's what minIsoEquivMaxExposure is assuming
    

    // currentUs
    for(var x = 0; x < (MAX_ISO / MIN_ISO); x++) {
      this.checkExposureBounds();
      console.log(`Starting exposure: ${(this.currentUs/1000).toFixed(2)}ms @ iso ${this.currentIso}`);
    }
    this.checkExposureBounds();
  }

  brighter(limitMultiply) {
    // we need to take into account the rolling shutter interval time.  We can only expose in multiples of 20us, apparently.
    // otherwise what can happen is:
    // [currentUs=51us -> rounds to 60us -> too bright] -> [adjusts to 49us -> rounds to 40us -> waaaay darker -> gets adjusted to 51us] -> rounds to 60us -> waaay brighter.
    // so we end up with this weird visual oscillation as the "perfect" exposure transitions through these zones causing us to bounce between too bright and too dark

    // the current fix says: "if your currentUs is 49, it rounds to 40us.  In order to jump to 60us, you need to require a brightness increase sufficient to go from 40us to 51us (+25%), not just from 49us to 51us (+4%)"
    const tookUs = roundToShutterMultiple(this.currentUs);
    this.currentUs = tookUs * Math.min(ADJUST_RATE, limitMultiply);

    this.checkExposureBounds();
  }
  darker(limitMultiply) {
    // see comment in brighter();
    const tookUs = roundToShutterMultiple(this.currentUs);
    this.currentUs = tookUs * Math.max(limitMultiply, (1 / ADJUST_RATE));
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
    if(this.currentUs > PREFERRED_EXPOSURE_US) {
      // hmm, we're getting to a pretty long exposure here...
      // let's step up the ISO
      if(this.currentIso < MAX_ISO) {
        this.currentUs /= 2;
        this.currentIso *= 2;
      } else {
        // we're maxed out on ISO too?  We can keep running up to MAX_EXPOSURE_US I guess
        if(this.currentUs >= MAX_EXPOSURE_US) {
          this.currentUs = MAX_EXPOSURE_US;
          this.currentIso = MAX_ISO;
        } else {
          // this is fine.  Stuff's going to get grainy, but we can support it.
        }
      }
    } else if(this.currentUs < MIN_EXPOSURE_US) {
      // below minimum exposure time.  Let's step down ISO
      if(this.currentIso > MIN_ISO) {
        // we still have some ISO room
        this.currentIso /= 2;
        this.currentUs *= 2;
      } else {
        // we're taking them as short and as insensitive as we can...
        this.currentIso = MIN_ISO;
        this.currentUs = MIN_EXPOSURE_US;
      }
    }

  }

  takePhoto() {
    const exposeUs = roundToShutterMultiple(this.currentUs);
    console.log(elapsed(), "takePhoto() " + (exposeUs/1000).toFixed(2) + "ms @ " + this.currentIso + " ISO");
    const setup = {
      shutterspeed: exposeUs,
      iso: this.currentIso,
      flicker: 'off',
      width: 1640,
      height: 922,
      imageEffect: 'none',
      drc: 'off',
      awb: 'sun',
      quality: 90,
    }
    // --timeout 1 comes from: https://www.raspberrypi.org/forums/viewtopic.php?t=203229
    console.log(elapsed(), "about to take picture");

    const cameraCommand = `raspistill --timeout 1000 -awb sun -ISO ${this.currentIso} -ss ${exposeUs} -w 1640 -h 922 -bm -drc off -ex off -md 5 -n -o ./tmp/from-camera.jpg`;
    console.log("running camera command ", cameraCommand);
    execSync(cameraCommand);
    console.log(elapsed(), "took picture");

    //execSync(`convert ./tmp/from-camera.jpg -resize ${IMAGE_SUBMISSION_WIDTH}x${IMAGE_SUBMISSION_HEIGHT} -quality 90% ./tmp/922p.jpg`);
    //console.log(elapsed(), "done writing to disk");
    const buffer = fs.readFileSync('./tmp/from-camera.jpg');
    console.log(elapsed(), `read from-camera.jpg with ${buffer.byteLength} bytes`);
    return Promise.resolve(buffer);
  }
  setupCamera(raspiCamera:Raspistill) {
    //console.log(elapsed(), "set camera to expose for " + (exposeUs/1000).toFixed(2) + "ms @ " + this.currentIso + " ISO");
    //raspiCamera.setOptions();
  }

  private analyzeHistogram(nthPercentileLow:number, nthPercentileHigh:number, nHisto:number, histos:number[][]):{low:number, mean:number, high:number} {
    const comboHisto = [];
    for(var x = 0;x < nHisto; x++) {comboHisto.push(0);}

    let total = 0;
    let sum = 0;
    for(var channel = 0; channel < histos.length; channel++) {
      for(var value = 0; value < histos[channel].length; value++) {
        comboHisto[value] += histos[channel][value];
        total += histos[channel][value];
      }
    }

    let targets = [
      (nthPercentileLow / 100)*total,
      total / 2,
      (nthPercentileHigh / 100)*total,
    ];
    let results = [];
    let currentSum = 0;
    for(var value = 0; value < comboHisto.length; value++) {
      const thisAddition = comboHisto[value];
      
      targets.forEach((target, index) => {
        if(target >= currentSum && target < (currentSum + thisAddition)) {
          results[index] = value;
        }
      })
      currentSum += thisAddition;
    }
    
    dassert(currentSum === total);

    return {low:results[0], mean:results[1], high:results[2]};
  }

  async analyzeAndLevelImage(imageBuffer:Buffer):Promise<Buffer> {

    const image = await ImageJs.load(imageBuffer);
    console.log(elapsed(), "image straight outta camera was ", image.width, " x ", image.height);

    //const savePath = `./test-${this.imagesTaken}-${(this.currentUs/1000).toFixed(0)}ms.jpg`;
    //console.log("saved to ", savePath);
    //image.save(savePath, {format: 'jpg'});

    const peakHistoBrightness = 256;
    const histo = (image as any).getHistograms({maxSlots: peakHistoBrightness, useAlpha: false});

    const histoResult = this.analyzeHistogram(2.5, 97.5, peakHistoBrightness, histo);
    console.log(elapsed(), "histoResult = ", histoResult);

    let sum = 0;
    let count = 0;
    for(var color = 0; color < histo.length; color++) {
      for(var val = 0; val < histo[color].length; val++) {
        sum += val * histo[color][val];
        count += histo[color][val];
      }
    }
    const mean = sum / count;
    const targetMean = peakHistoBrightness / 2;
    const multiplyToGetToTarget = targetMean / mean;
    console.log(elapsed(), "mean brightness = ", mean.toFixed(1));

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
    console.log(elapsed(), "brightened or darked");

    //console.log(elapsed(), "about to multiply");
    //(resizedImage as any).multiply(multiplyToGetToTarget);
    //console.log(elapsed(), "multiplied");
    
    //console.log(elapsed(), "about to level");
    //resizedImage.level({channels: [0,1,2], min: histoResult.low, max:histoResult.high});
    //console.log(elapsed(), "leveled");

    this.imagesTaken++;
    return imageBuffer;
  }
}
