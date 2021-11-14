import fs from 'fs';
import { LatLngModel } from '../webapp/src/Configs/LatLng/Model';
import { analyzeHistogram, getHistogram, getHistogramInRc, getMeanBrightness, ImageEffects, testAssert } from '../webapp/src/Configs/Utils';
import {Image} from 'canvas';
import { ProcessModel } from '../webapp/src/Configs/Process/Model';
import { CurrentTimeModel } from '../webapp/src/Configs/CurrentTime/Model';
import {apply as processApply} from '../webapp/src/Configs/Process/Code';

export async function runTestImages() {

  const root = `./test-images`
  const imgs = fs.readdirSync(root);
  let lastPromise:Promise<any> = Promise.resolve();

  const modelToTest =  {
    "Camera": {
      "desiredW": 1920,
      "desiredH": 1272,
      "desiredPhotoPeriodMs": 10000,
      "minSunAngle": -90,
      "targetedMeanBrightness": 128,
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

  { // testing the too-bright and too-dark images
    const buf = fs.readFileSync("./saved-images/too-bright/1636833837512.jpg");
    const canvas = await ImageEffects.prepareCanvasFromBuffer(buf, () => new Image());
    const meanBrightness = getMeanBrightness(canvas, getHistogram);
    testAssert(meanBrightness.mean >= 200, "This sucker is real bright, so it should score well over 200");

    const rcExposure = { left: 264, top: 500, right: 1577, bottom: 653 };
    const meanBrightnessInRc = getMeanBrightness(canvas, (canvas) => getHistogramInRc(canvas, rcExposure));
    testAssert(meanBrightness.mean >= 200, "This sucker is real bright, so it should score well over 200");

    // testing the histogram analyzer - we already know what the mean of this image is, so we can verify
    const analyze = analyzeHistogram(0, 100, meanBrightness.histo.length, meanBrightness.histo);
    testAssert(analyze.mean >= 218 && analyze.mean <= 238, "I mean, the right answer is 228, but we'll give a little bit of wiggle room");


    // ok, let's try to process this sucker!
    const modelWithRc = JSON.parse(JSON.stringify(modelToTest));
    modelWithRc.Camera.rcExposure = rcExposure;
    const canvasAfterApplication = processApply(canvas, modelWithRc);
    const meanBrightnessAfterEdit = getMeanBrightness(canvasAfterApplication, (canvas) => getHistogramInRc(canvas, rcExposure));
    debugger;
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