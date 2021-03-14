import { Canvas } from "canvas";
import { LatLngModel } from "../LatLng/Model";
import { analyzeHistogram, elapsed, getMeanBrightness } from "../Utils";
import { ProcessModel } from "./Model";
import SunCalc from 'suncalc';

export function apply(input:Canvas, models:any):Canvas {

  const ctx = input.getContext('2d');

  let myModel:ProcessModel|null = models['Process'];
  if(!myModel) {
    myModel = {
      day: {
        dropPctDark: 2.5,
        dropPctLight: 97.5,
      },
      night: {
        dropPctDark: 10.0,
        dropPctLight: 90,
      }
    }
  }

  const currentDate = new Date(models['CurrentTime'].tm);

  const finalModel = myModel.day;
  const latLng:LatLngModel|null = models['LatLng'];
  if(latLng) {
    console.log("we have lat/lng data!  so we should be able to apply day/night variation in the model!");
    const pos = SunCalc.getPosition(currentDate, latLng.lat, latLng.lng);
    const angleDegrees = pos.altitude * 180 / Math.PI;
    const fullDay = 10;
    const fullNight = -10;
    let pctDay = (angleDegrees - fullNight) / (fullDay - fullNight);
    pctDay = Math.max(0.0, pctDay);
    pctDay = Math.min(1.0, pctDay);

    console.log(`Processing: Because we have latlng ${latLng.lat.toFixed(2)}, ${latLng.lng.toFixed(2)} and sun angle ${angleDegrees.toFixed(1)} deg, we are ${(pctDay*100).toFixed(0)}% daytime`);
    finalModel.dropPctDark = pctDay*myModel.day.dropPctDark + (1-pctDay)*myModel.night.dropPctDark;
    finalModel.dropPctLight = pctDay*myModel.day.dropPctLight + (1-pctDay)*myModel.night.dropPctLight;
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
      pixels[index] = Math.floor(256 * (byt - histoResult.low) / (span));
    })
    ctx.putImageData(data, 0, 0);
  }

  return input;
}