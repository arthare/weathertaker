import fetch from 'node-fetch';
import NodeWebcam from 'node-webcam';
import { platform } from 'os';
import fs from 'fs';
import {Raspistill} from 'node-raspistill';
import {RaspiStill} from './PluginRaspiStill';
import {Image as ImageJs} from 'image-js';
import { exec, execSync } from 'child_process';
import {ImageEffects} from './ImageEffects';
import { elapsed } from '../webapp/src/Configs/Utils';
import { LatLngModel } from '../webapp/src/Configs/LatLng/Model';
import {CameraModel} from '../webapp/src/Configs/Camera/Model';
import {ImageSubmissionRequest, IMAGE_SUBMISSION_HEIGHT, IMAGE_SUBMISSION_WIDTH, RecentRawFileSubmissionRequest} from '../webapp/src/Configs/Types';
import {runTestImages} from './index-testImages';
import {runWatchdog} from './index-watchdog';
import {prepareCameraPlugins} from './PluginFactory';
import { CameraPlugin } from './Plugin';

let g_tmLastRawImage = new Date().getTime();
const IMAGE_CADENCE = 20000;

try {
  fs.mkdirSync('./tmp');
  fs.writeFileSync("./tmp/startup.txt", "started!");
} catch(e) {

}

if(process.argv.find((arg) => arg === 'watchdog')) {
  runWatchdog();
} else if(process.argv.find((arg) => arg === "test-images")) {
  runTestImages();
} else {

  let ixCurrentPlugin = 0;
  let cameraPlugins:CameraPlugin[] = prepareCameraPlugins();


  function getApiUrl(api:string) {
    let base = 'http://fastsky.ca/api';
    if(platform() === 'win32') {
      base = 'http://localhost:2702';
    }

    return `${base}/${api}`;
  }

  let g_currentModels = {
    Camera: {
      desiredW: 1280,
      desiredH: 720,
    }
  }; // the configured models from the database.  Gets updated on each image submission

  let config:any;
  try {  
    config = JSON.parse(fs.readFileSync('./config.json', 'utf8'));
  } catch(e) {
    console.log("You need to set up a config.json that includes {apiKey: 'your-api-key'}");
    process.exit(1);
  }

  let photoAttemptsSinceLastSuccess = 0;

  async function acquireRawImage():Promise<{image:Buffer, exposer:CameraPlugin}> {

    try {
      const buffer = await cameraPlugins[ixCurrentPlugin].takePhoto(g_currentModels['Camera']);
      photoAttemptsSinceLastSuccess = 0;
      return {image: buffer, exposer: cameraPlugins[ixCurrentPlugin]};
    } catch(e) {
      // hmm, I guess we can try the next plugin
      ixCurrentPlugin++;
      if(ixCurrentPlugin > cameraPlugins.length) {
        ixCurrentPlugin = 0;
      }
      return acquireRawImage();
    }
    
  }

  async function checkSaveRawImage(rawBuffer:Buffer):Promise<any> {
    // this checks to see if we've taken an exemplar of a "night" or "noon" image and if so, sends it to the web DB
    const dtNow = new Date();
    const dtLast = new Date(g_tmLastRawImage);
    let when:"noon"|"night"|null = null;
    if(dtNow.getHours() === 0 && dtLast.getHours() === 23) {
      // we just took the midnight image!
      when = 'night';
    } else if(dtNow.getHours() === 12 && dtLast.getHours() === 11) {
      // we just took the noon image!
      when = 'noon';
    }

    if(when) {
      // we took an image worth submitting
      const req:RecentRawFileSubmissionRequest = {
        apiKey: config.apiKey,
        imageBase64: rawBuffer.toString('base64'),
        when,
      }
      console.log(`Submitting the '${when}' example image`);
      fetch(getApiUrl('recent-raw-file-submission'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(req),
      });
    }

    g_tmLastRawImage = dtNow.getTime();

  }
  async function captureAndProcessOneImage():Promise<Buffer> {
    
    try {
      fs.mkdirSync('./tmp');
      fs.mkdirSync('./photos');
    } catch(e) {
      // hope it already exists...
    }
    
    const exposure = await acquireRawImage();
    
    checkSaveRawImage(exposure.image);
    
    console.log(elapsed(), "picture taken, doing processing");
    const canvas = await ImageEffects.prepareCanvasFromBuffer(exposure.image);
    console.log("canvas prepared");

    await exposure.exposer.analyzeRawImage(canvas);
    const processedImage = await ImageEffects.process(canvas, g_currentModels);
    const compressedImage = processedImage.toBuffer("image/jpeg", {quality: 90});
    console.log(elapsed(), "processing complete, and produced a ", compressedImage.byteLength, "-byte image");
    return compressedImage;
  }
        
  let submitPromise = Promise.resolve();
  let submitCount = 0;


  function takePictureLoop() {
    let mySubmitCount = submitCount++;

    console.log(elapsed(), mySubmitCount, "commanding to take one picture", ixCurrentPlugin);
    const tmStart = elapsed();
    const tmNext = tmStart + IMAGE_CADENCE;
    return captureAndProcessOneImage().then(async (data:Buffer) => {
      
      console.log(elapsed(), mySubmitCount, "image captured and processed");
      const url = getApiUrl('image-submission');

      

      submitPromise = submitPromise.then(async () => {
        console.log(elapsed(), mySubmitCount, "About to encode base64 string from image");
        const base64 = data.toString('base64');
        console.log(elapsed(), mySubmitCount, `Encoded ${base64.length}-char base64 string from image`);
        const request:ImageSubmissionRequest = {
          apiKey: config.apiKey,
          imageBase64: base64
        }
        return fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(request),
        }).then((response) => {
          if(!response.ok) {
            console.log(elapsed(), mySubmitCount, "website said bad");
            throw response;
          } else {
            console.log(elapsed(), mySubmitCount, "posted successfully!");
            return response.json().then((response) => {
              g_currentModels = response?.models || {};
              console.log("new model from web: ", response);
              
              let cameraConfig:CameraModel = g_currentModels['Camera'];
              if(!cameraConfig) {
                g_currentModels['Camera'] = {
                  desiredW: 1280,
                  desiredH: 720,
                }
              }
            })
          }
        }).catch((failure) => {
          // oh well...
          console.log(elapsed(), mySubmitCount, "Failed to submit image: ", failure);
        })
      })

    }).catch((failure) => {
      console.error("Failure to capture: ", failure);

      // uh, if everything messed up, let's just try both cameras again and hope...
    }).finally(() => {

      // we want to take images on a IMAGE_CADENCE-second period.  We've probably used up a bunch of those seconds, so let's figure out how long to sleep.
      const tmFinally = elapsed();
      const msUntil = Math.max(tmNext - tmFinally, 0);

      console.log(elapsed(), mySubmitCount, msUntil, "ms until we take the next picture ", tmNext, tmFinally);
      setTimeout(takePictureLoop, msUntil);
    })

  }
  takePictureLoop();

}
