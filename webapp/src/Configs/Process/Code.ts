import { Canvas } from "canvas";
import { LatLngModel } from "../LatLng/Model";
import { analyzeHistogram, elapsed, getHistogram, getHistogramInRc, getMeanBrightness, testAssert } from "../Utils";
import { ProcessModel } from "./Model";
import SunCalc from 'suncalc';


function copyOverDefaults(model:any, key:string, defSetting:any) {
  if(!model[key]) {
    model[key] = defSetting[key];
  } else {
    // need to check individual settings
    const settingObj = model[key];
    for(var settingName in defSetting[key]) {
      if(settingObj[settingName] === undefined) {
        settingObj[settingName] = defSetting[key][settingName];
      }
    }
  }
}

export function apply<T>(input:T, models:any):T {

  const ctx = (input as any).getContext('2d');

  let myModel:ProcessModel = models['Process'] || {};

  const defaultModel:ProcessModel = {
    day: {
      dropPctDark: 2.5,
      dropPctLight: 100,
      middle: 128,
      minStretchSpan: 80,
      centerPointMin: 0.2,
      centerPointMax: 0.8,
    },
    night: {
      dropPctDark: 10.0,
      dropPctLight: 90,
      middle: 128,
      minStretchSpan: 80,
      centerPointMin: 0.2,
      centerPointMax: 0.8,
    },
    do:true,
  }

  copyOverDefaults(myModel, 'day', defaultModel);
  copyOverDefaults(myModel, 'night', defaultModel);

  const finalModel = myModel.day;
  const latLng:LatLngModel|null = models['LatLng'];
  if(latLng && models['CurrentTime']) {
    let pctDay = models['CurrentTime'].pctDay;
    
    finalModel.dropPctDark = pctDay*myModel.day.dropPctDark + (1-pctDay)*myModel.night.dropPctDark;
    finalModel.dropPctLight = pctDay*myModel.day.dropPctLight + (1-pctDay)*myModel.night.dropPctLight;
    finalModel.middle = pctDay * myModel.day.middle + (1-pctDay)*myModel.night.middle;
    finalModel.minStretchSpan = (pctDay * myModel.day.minStretchSpan + (1-pctDay)*myModel.night.minStretchSpan);
    finalModel.centerPointMin = (pctDay * myModel.day.centerPointMin + (1-pctDay)*myModel.night.centerPointMin);
    finalModel.centerPointMax = (pctDay * myModel.day.centerPointMax + (1-pctDay)*myModel.night.centerPointMax);

    console.log("currenttime model = ", models['CurrentTime'], " finalModel = ", finalModel);
  } else {
    console.log("we didn't get told what time it was, so we'll assume it is daytime");
  }

  let fnHisto = getHistogram;
  try {
    if(models['Camera']['rcExposure']) {
      const rc = models['Camera']['rcExposure'];

      if(rc && 
         typeof rc.left === 'number' &&
         typeof rc.top === 'number' &&
         typeof rc.right === 'number' &&
         typeof rc.bottom === 'number') {
        // ok, they're definitely operating with a valid histogram selector, so let's pick our histogram off of the selected region
        fnHisto = (canvas:Canvas) => getHistogramInRc(canvas, rc);
      }
    }
  } catch(e) {}

  const peakHistoBrightness = 256;
  const basicStats = getMeanBrightness((input as any), fnHisto);

  const histoResult = analyzeHistogram(finalModel.dropPctDark, finalModel.dropPctLight, peakHistoBrightness, basicStats.histo);

  const data = ctx.getImageData(0,0,(input as any).width, (input as any).height);
  const pixels = data.data;

  let span = histoResult.high - histoResult.low;


  const MIN_SPAN = finalModel.minStretchSpan;
  console.log("Processing: image stats histoResult ", histoResult, "mean ", basicStats.mean, " span ", span, " min span ", MIN_SPAN);
  if(span < MIN_SPAN) {
    if(histoResult.mean < MIN_SPAN / 2) {
      histoResult.low = 0;
      histoResult.high = MIN_SPAN;
    } else if(histoResult.mean > peakHistoBrightness - MIN_SPAN/2) {
      histoResult.low = peakHistoBrightness - MIN_SPAN;
      histoResult.high = peakHistoBrightness;
    } else {
      histoResult.low = histoResult.mean - MIN_SPAN/2;
      histoResult.high = histoResult.mean + MIN_SPAN/2;
    }
    span = histoResult.high - histoResult.low;
    testAssert(span >= MIN_SPAN, "after all this math it better be");
    
  }
  
  let meanToUse = histoResult.mean;
  if(finalModel?.centerPointMin !== undefined && finalModel.centerPointMax !== undefined) {
    // in a really dark scene, we might have histoResult = {low: 0, mean: 0.1, high: 30}.  Which means pixels between (0.0,0.1) get massively stretched to finalModel.middle, and pixels above that get blasted to nearly full brightness
    // so let's make sure the meanToUse is between the 10% and 90% of brightness and see what that looks like
    const lowLimit = histoResult.low + finalModel.centerPointMin * (histoResult.high - histoResult.low);
    const highLimit = histoResult.low + finalModel.centerPointMax * (histoResult.high - histoResult.low);
    meanToUse = Math.max(meanToUse, lowLimit);
    meanToUse = Math.min(meanToUse, highLimit);
  }


  if(span >= MIN_SPAN) {
    console.log("actually applying processing...");
    pixels.forEach((byt:any, index:any) => {
      let val = byt;
      if(val < meanToUse) {
        const pct = Math.max(0, (val - histoResult.low) / (meanToUse - histoResult.low));
        testAssert(pct >= 0 && pct <= 1.0);
        val = Math.floor(pct * finalModel.middle);
      } else {
        const pct = Math.min(1, (val-meanToUse) / (histoResult.high-meanToUse));
        testAssert(pct >= 0 && pct <= 1.0);
        val = finalModel.middle + Math.floor(pct*(255-finalModel.middle));
      }

      pixels[index] = Math.floor(val);
    })
    ctx.putImageData(data, 0, 0);
  }

  if(process.env['SAVELOCALIMAGES']) {
    // we're doing some logging and research on images, so let's do an "after"
    const basicStatsAfter = getMeanBrightness((input as any), fnHisto);
    const histoResultAfter = analyzeHistogram(finalModel.dropPctDark, finalModel.dropPctLight, peakHistoBrightness, basicStatsAfter.histo);
    console.log("After Processing: image stats histoResult ", histoResultAfter, " with mean ", basicStatsAfter.mean);
  }

  return input as T;
}