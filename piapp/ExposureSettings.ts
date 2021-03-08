import {Raspistill} from 'node-raspistill';
import {Image as ImageJs} from 'image-js';
import {dassert} from './Utils';
import { IMAGE_SUBMISSION_HEIGHT, IMAGE_SUBMISSION_WIDTH } from '../types/http';


// the camera can actually go longer and shorter than these bounds, I just don't want it to get too blurry
const MAX_EXPOSURE_US = 2000*1000; // 10s, max exposure for the v2 camera
const PREFERRED_EXPOSURE_US = 1000*1000; // "preferred" exposure is used so that we use more ISO instead of more exposure time, until we're capped out on ISO
const MIN_EXPOSURE_US = 100; // 1/10000s

const DEFAULT_EXPOSURE_US = MAX_EXPOSURE_US / 2;
const DEFAULT_ISO = 800;

const ADJUST_RATE = 2.75;

// these appear to be the actual capabilities of the camera
const MAX_ISO = 800;
const MIN_ISO = 100;

export class ExposureSettings {
  currentUs = 100000;
  currentIso = 100;
  imagesTaken = 0;

  constructor() {
    this.currentUs = DEFAULT_EXPOSURE_US; // 100ms, 1/10 second
    this.currentIso = DEFAULT_ISO;
    this.checkExposureBounds();
  }

  brighter(limitMultiply) {
    this.currentUs *= Math.min(ADJUST_RATE, limitMultiply);
    this.checkExposureBounds();
  }
  darker(limitMultiply) {
    this.currentUs *= Math.max(limitMultiply, (1 / ADJUST_RATE));
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

  setupCamera(raspiCamera:Raspistill) {
    console.log("set camera to expose for " + (this.currentUs/1000).toFixed(2) + "ms @ " + this.currentIso + " ISO");
    raspiCamera.setOptions({
      shutterspeed: (Math.floor(this.currentUs / 20)*20),
      iso: this.currentIso,
      flicker: 'off',
      width: 1920,
      height: 1080,
      imageEffect: 'none',
      drc: 'off',
      awb: 'sun',
    });
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
    console.log("image straight outta camera was ", image.width, " x ", image.height);

    const savePath = `./test-${this.imagesTaken}-${(this.currentUs/1000).toFixed(0)}ms.jpg`;
    console.log("saved to ", savePath);
    image.save(savePath, {format: 'jpg'});

    const peakHistoBrightness = 256;
    const histo = (image as any).getHistograms({maxSlots: peakHistoBrightness, useAlpha: false});

    const histoResult = this.analyzeHistogram(2.5, 97.5, peakHistoBrightness, histo);
    console.log("histoResult = ", histoResult);

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
    console.log("mean brightness = ", mean.toFixed(1));
    if(mean < targetMean) {
      this.brighter(multiplyToGetToTarget);
    } else if(mean > targetMean) {
      this.darker(multiplyToGetToTarget);
    }


    let resizedImage = image;
    if(image.width !== IMAGE_SUBMISSION_WIDTH || image.height !== IMAGE_SUBMISSION_HEIGHT) {
      resizedImage = image.resize({width: IMAGE_SUBMISSION_WIDTH, height: IMAGE_SUBMISSION_HEIGHT});
    }

    //await resizedImage.save(`modding-${this.imagesTaken}-1.jpg`, {format: 'jpg'});
    //(resizedImage as any).multiply(multiplyToGetToTarget);
    //await resizedImage.save(`modding-${this.imagesTaken}-2.jpg`, {format: 'jpg'});
    resizedImage.level({channels: [0,1,2], min: histoResult.low, max:histoResult.high});
    //await resizedImage.save(`modding-${this.imagesTaken}-3.jpg`, {format: 'jpg'});

    this.imagesTaken++;
    return Buffer.from(await resizedImage.toBuffer({format: 'jpg'}));
  }
}
