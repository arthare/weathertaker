import fetch from 'node-fetch';
import NodeWebcam from 'node-webcam';
import { platform } from 'os';
import fs from 'fs';
import {Raspistill} from 'node-raspistill';
import {RaspiStill} from './PluginRaspiStill';
import {Image as ImageJs} from 'image-js';
import { exec, execSync, spawnSync } from 'child_process';
import { ImageEffects } from '../webapp/src/Configs/Utils';
import { elapsed } from '../webapp/src/Configs/Utils';
import { LatLngModel } from '../webapp/src/Configs/LatLng/Model';
import {CameraModel} from '../webapp/src/Configs/Camera/Model';
import {ImageSubmissionRequest, IMAGE_SUBMISSION_HEIGHT, IMAGE_SUBMISSION_WIDTH, RecentRawFileSubmissionRequest} from '../webapp/src/Configs/Types';
import {runTestImages} from './index-testImages';
import {runWatchdog} from './index-watchdog';
import {prepareCameraPlugins} from './PluginFactory';
import { CameraPlugin } from './Plugin';
import {Canvas, Image} from 'canvas';
import SunCalc from 'suncalc';
import { isPowerfulPi } from './PluginUtils';


let g_takePictureLoopTimeout:NodeJS.Timeout = null;
let g_fImageAsap = false;

let config:any = null;
let g_tmLastRawImage = new Date().getTime();
const DEFAULT_IMAGE_CADENCE_MS = 20000;

let ixCurrentPlugin = 0;
let cameraPlugins:CameraPlugin[] = prepareCameraPlugins();



const defaultCameraModel = {
  desiredW: 1280,
  desiredH: 720,
  minSunAngle: -90,
  desiredPhotoPeriodMs: DEFAULT_IMAGE_CADENCE_MS,
  extraParams: '',
} as CameraModel;

const defaultModel = {
  Camera: defaultCameraModel,
}; // the configured models from the database.  Gets updated on each image submission
let g_currentModels:any = defaultModel;

try {
  g_currentModels = JSON.parse(fs.readFileSync('./last-model.json', 'utf8'));
  if(!g_currentModels || !g_currentModels['Camera']) {
    g_currentModels = defaultModel;
  }
} catch(e) {
  // that's fine, we'll just use the defaultiest default
  g_currentModels = defaultModel;
}


try {  
  config = JSON.parse(fs.readFileSync('./config.json', 'utf8'));
} catch(e) {
  console.log("You need to set up a config.json that includes {apiKey: 'your-api-key'}");
  process.exit(1);
}

let photoAttemptsSinceLastSuccess = 0;

    
let submitPromise = Promise.resolve();
let submitCount = 0;



function getCurrentSunAngle(models:any) {
  if(models['LatLng']) {
    const latLng:LatLngModel = models['LatLng'];
    const pos = SunCalc.getPosition(new Date(), latLng.lat, latLng.lng);
    const angleDegrees = pos.altitude * 180 / Math.PI;
    return angleDegrees;
  }
  return 45;
}
function getApiUrl(api:string) {
  let base = 'http://fastsky.ca/api';
  if(platform() === 'win32') {
    base = 'http://localhost:2702';
  }

  return `${base}/${api}`;
}

async function acquireRawImage():Promise<{image:Buffer, exposer:CameraPlugin}> {

  console.log("acquiring image from plugin ", ixCurrentPlugin, " of ", cameraPlugins.length);
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
    throw e;
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
  
  const canvas = await ImageEffects.prepareCanvasFromBuffer(exposure.image, () => new Image());

  await exposure.exposer.analyzeRawImage(canvas);
  let processedImage:Canvas;
  if(isPowerfulPi() && g_currentModels?.Process?.do) {
    processedImage = await ImageEffects.process(canvas, g_currentModels);
  } else {
    // no processing on Pi zero's!
    processedImage = canvas;
  }
  
  const compressedImage = processedImage.toBuffer("image/jpeg", {quality: 90});
  return compressedImage;
}

const hostName = spawnSync(`hostname`, ['-I']);
const localIp = hostName.stdout.toString();
console.log("LocalIp = ", localIp);


export function takePictureLoop() {

  clearTimeout(g_takePictureLoopTimeout);
  g_takePictureLoopTimeout = null;

  let mySubmitCount = submitCount++;

  console.log(elapsed(), mySubmitCount, "commanding to take one picture", ixCurrentPlugin, " photo period ", g_currentModels['Camera'].desiredPhotoPeriodMs);
  const tmStart = elapsed();
  const tmNext = tmStart + g_currentModels['Camera'].desiredPhotoPeriodMs;
  return captureAndProcessOneImage().then(async (data:Buffer) => {
    
    const url = getApiUrl('image-submission');

    // saves so that index-webserver can expose it
    fs.writeFile('./tmp/last-image.jpg', data, ()=>{});
    

    submitPromise = submitPromise.then(async () => {
      const base64 = data.toString('base64');
      const request:ImageSubmissionRequest = {
        apiKey: config.apiKey,
        imageBase64: base64,
        localIp,
      }

      const currentSunAngle = getCurrentSunAngle(g_currentModels);
      if(currentSunAngle < g_currentModels.Camera.minSunAngle) {
        // you said to not do sun angles less than this!
        return Promise.resolve();
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
          fs.writeFileSync('./tmp/internet-sends.txt', '' + mySubmitCount);
          return response.json().then((response) => {
            g_currentModels = response?.models || {};
            fs.writeFileSync('./last-model.json', JSON.stringify(response));
            console.log("new model from web: ", JSON.stringify(response, undefined, '\t'));
            
            let cameraConfig:CameraModel = g_currentModels['Camera'];
            if(!cameraConfig) {
              g_currentModels['Camera'] = defaultCameraModel;
            } else {
              for(var key in defaultCameraModel) {
                if(!cameraConfig[key]) {
                  cameraConfig[key] = defaultCameraModel[key];
                  console.log("Updated camera config with  ", key, " = ", defaultCameraModel['key']);
                }
              }
              g_currentModels['Camera'] = cameraConfig;
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
    let msUntil = Math.max(tmNext - tmFinally, 0);

    if(g_fImageAsap) {
      // takeImageAsap() got called while were imaging, so we need to take another one immediately
      msUntil = 0;
      g_fImageAsap = false;
    }
    console.log(elapsed(), mySubmitCount, msUntil, "ms until we take the next picture ", tmNext, tmFinally);
    g_takePictureLoopTimeout = setTimeout(takePictureLoop, msUntil);
  })

}


export function takeImageAsap() {
  if(g_takePictureLoopTimeout) {
    // this means we're between pics and can short-circuit the situation
    clearTimeout(g_takePictureLoopTimeout);
    takePictureLoop();
  } else {
    // we're presently taking a picture, so there's not a ton we can do
    g_fImageAsap = true;
  }
}

