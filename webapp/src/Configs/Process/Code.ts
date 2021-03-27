import { Canvas } from "canvas";
import { LatLngModel } from "../LatLng/Model";
import { analyzeHistogram, elapsed, getMeanBrightness, testAssert } from "../Utils";
import { ProcessModel } from "./Model";
import SunCalc from 'suncalc';


export function apply(input:Canvas, models:any):Canvas {

  const ctx = input.getContext('2d');

  let myModel:ProcessModel = models['Process'] || {};

  const defaultModel:ProcessModel = {
    day: {
      dropPctDark: 2.5,
      dropPctLight: 99.9,
      middle: 32,
    },
    night: {
      dropPctDark: 10.0,
      dropPctLight: 90,
      middle: 128,
    },
  }

  for(var key in defaultModel) {
    if(!(myModel as any)[key]) {
      (myModel as any)[key] = (defaultModel as any)[key] as any;
    }
  }


  const finalModel = myModel.day;
  const latLng:LatLngModel|null = models['LatLng'];
  if(latLng) {
    let pctDay = models['CurrentTime'].pctDay;
    
    finalModel.dropPctDark = pctDay*myModel.day.dropPctDark + (1-pctDay)*myModel.night.dropPctDark;
    finalModel.dropPctLight = pctDay*myModel.day.dropPctLight + (1-pctDay)*myModel.night.dropPctLight;
    finalModel.middle = pctDay * myModel.day.middle + (1-pctDay)*myModel.night.middle;
    console.log("processing with pctDay = ", pctDay, finalModel.middle, finalModel.dropPctDark, finalModel.dropPctLight);
  }

  const peakHistoBrightness = 256;
  const basicStats = getMeanBrightness(input);

  const histoResult = analyzeHistogram(myModel.day.dropPctDark, myModel.day.dropPctLight, peakHistoBrightness, basicStats.histo);
  console.log(elapsed(), "histoResult = ", histoResult);

  const data = ctx.getImageData(0,0,input.width, input.height);
  const pixels = data.data;

  console.log(elapsed(), "about to level");
  const span = histoResult.high - histoResult.low;
  if(span > 10) {
    pixels.forEach((byt, index) => {
      let val = byt;
      if(val < histoResult.mean) {
        const pct = Math.max(0, (val - histoResult.low) / (histoResult.mean - histoResult.low));
        testAssert(pct >= 0 && pct <= 1.0);
        val = pct * finalModel.middle;
      } else {
        const pct = Math.min(1, (val-histoResult.mean) / (histoResult.high-histoResult.mean));
        testAssert(pct >= 0 && pct <= 1.0);
        val = finalModel.middle + pct*(256-finalModel.middle);
      }

      pixels[index] = Math.floor(val);
    })
    ctx.putImageData(data, 0, 0);
  }

  return input;
}