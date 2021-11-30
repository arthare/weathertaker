import fs from 'fs';
import { LatLngModel } from '../webapp/src/Configs/LatLng/Model';
import { analyzeHistogram, getHistogram, getHistogramInRc, getMeanBrightness, ImageEffects, testAssert } from '../webapp/src/Configs/Utils';
import {Image} from 'canvas';
import { ProcessModel } from '../webapp/src/Configs/Process/Model';
import { CurrentTimeModel } from '../webapp/src/Configs/CurrentTime/Model';
import {apply as processApply} from '../webapp/src/Configs/Process/Code';

export async function runTestImages() {

  process.env['SAVELOCALIMAGES'] = "1";

  const root = `./test-images`
  const imgs = fs.readdirSync(root);
  let lastPromise:Promise<any> = Promise.resolve();

  { // testing stretching on/off in dark situations
    const modelToTest = JSON.parse(fs.readFileSync('./test-images/1638248040436.json', 'utf8'));
    const buf1 = fs.readFileSync("./test-images/1638248040436.jpg");
    const canvas1 = await ImageEffects.prepareCanvasFromBuffer(buf1, () => new Image());
    const canvasAfterApplication = processApply(canvas1, modelToTest);
    fs.writeFileSync(`./test-images/1638248040436-save.png`, canvasAfterApplication.toBuffer());
  }

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
  {
    const modelWithRc = JSON.parse(JSON.stringify(modelToTest));
    modelWithRc.Camera.rcExposure = {
      "left": 267,
      "top": 0,
      "right": 1637,
      "bottom": 761
    };
    modelWithRc.Process.day = {
      "dropPctDark": 1.5,
      "middle": 128,
      "dropPctLight": 99,
      "minStretchSpan": 80
    }
    const buf1 = fs.readFileSync("./saved-images/1636904096165.jpg");
    const canvas1 = await ImageEffects.prepareCanvasFromBuffer(buf1, () => new Image());
    const canvasAfterApplication = processApply(canvas1, modelWithRc);
    fs.writeFileSync(`./saved-images/1636904096165-edit-${modelWithRc.Process.day.dropPctDark}-${modelWithRc.Process.day.dropPctLight}.png`, canvasAfterApplication.toBuffer());

  }

  { // testing the too-bright and too-dark images
    const rcExposure1 = { left: 264, top: 500, right: 1577, bottom: 653 };
    const modelWithRc = JSON.parse(JSON.stringify(modelToTest));
    modelWithRc.Camera.rcExposure = rcExposure1;

    const buf1 = fs.readFileSync("./saved-images/too-bright/1636833837512.jpg");
    const canvas1 = await ImageEffects.prepareCanvasFromBuffer(buf1, () => new Image());
    const meanBrightness = getMeanBrightness(canvas1, getHistogram);
    testAssert(meanBrightness.mean >= 200, "This sucker is real bright, so it should score well over 200");

    const meanBrightnessInRc = getMeanBrightness(canvas1, (canvas) => getHistogramInRc(canvas, rcExposure1));
    testAssert(meanBrightnessInRc.mean >= 200, "This sucker is real bright, so it should score well over 200");

    // testing the histogram analyzer - we already know what the mean of this image is, so we can verify
    const analyze = analyzeHistogram(0, 100, meanBrightness.histo.length, meanBrightness.histo);
    testAssert(analyze.mean >= 218 && analyze.mean <= 238, "I mean, the right answer is 228, but we'll give a little bit of wiggle room");


    // ok, let's try to process this sucker!
    const canvasAfterApplication = processApply(canvas1, modelWithRc);
    const meanBrightnessAfterEdit = getMeanBrightness(canvasAfterApplication, (canvas) => getHistogramInRc(canvas, rcExposure1));

    
    // this is a nighttime shot
    const buf2 = fs.readFileSync("./saved-images/too-dark/1636863241684.jpg");
    const canvas2 = await ImageEffects.prepareCanvasFromBuffer(buf2, () => new Image());
    modelWithRc.Camera.rcExposure = {
      "left": 267,
      "top": 0,
      "right": 1637,
      "bottom": 761
    };
    modelWithRc.Process = {
      "day": {
        "dropPctDark": 10,
        "middle": 128,
        "dropPctLight": 85,
        "minStretchSpan": 80
      },
      "night": {
        "dropPctDark": 10,
        "middle": 128,
        "dropPctLight": 85,
        "minStretchSpan": 40
      }
    }
    const canvasAfterApplication2 = processApply(canvas2, modelWithRc);
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