import fs from 'fs';
import { LatLngModel } from '../webapp/src/Configs/LatLng/Model';
import { getHistogram, ImageEffects, testAssert } from '../webapp/src/Configs/Utils';
import {Image} from 'canvas';
import { ProcessModel } from '../webapp/src/Configs/Process/Model';
import { CurrentTimeModel } from '../webapp/src/Configs/CurrentTime/Model';

export async function runTestImages() {

  const root = `./test-images`
  const imgs = fs.readdirSync(root);
  let lastPromise:Promise<any> = Promise.resolve();

  const modelToTest =  {
    "Camera": {
      "desiredW": 1920,
      "desiredH": 1272,
      "desiredPhotoPeriodMs": 10000,
      "minSunAngle": -90
    },
    "LatLng": {
      "lat": 51.1984,
      "lng": -114.487
    },
    "Process": {
      "day": {
        "dropPctDark": 0,
        "middle": 128,
        "dropPctLight": 100,
        "minStretchSpan": 80
      },
      "night": {
        "dropPctDark": 10,
        "middle": 128,
        "dropPctLight": 95,
        "minStretchSpan": 40
      }
    }
  }

  const buf = fs.readFileSync("./test-images/special/gray-circle.proc.png");
  const canvas = await ImageEffects.prepareCanvasFromBuffer(buf, () => new Image());
  const histo = getHistogram(canvas);
  testAssert(histo[255] === 0, "This image is designed so that we shouldn't see any pure-white pixels as long as we're only histogramming the central circle");

  for(var x = 0;x < imgs.length; x++) {
    const img = imgs[x];
    const file = `${root}/${img}`;
    await lastPromise;
    if(fs.statSync(file).isDirectory()) {
      continue;
    }
    if(img.includes( '.proc.')) {
      continue;
    }

    const buf = fs.readFileSync(file);
    const canvas = await ImageEffects.prepareCanvasFromBuffer(buf, () => new Image());

    let processed = await (lastPromise = ImageEffects.process(canvas, modelToTest));
    
    fs.writeFileSync(`${file}.proc.jpg`, processed.toBuffer());
  }



  await lastPromise;
}