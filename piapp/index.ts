import fetch from 'node-fetch';
import NodeWebcam from 'node-webcam';
import { platform } from 'os';
import fs from 'fs';
import {Raspistill} from 'node-raspistill';
import {ExposureSettings} from './ExposureSettings';
import {Image as ImageJs} from 'image-js';
import { exec, execSync } from 'child_process';
import {ImageEffects} from './ImageEffects';
import { elapsed } from '../webapp/src/Configs/Utils';
import { LatLngModel } from '../webapp/src/Configs/LatLng/Model';
import {CameraModel} from '../webapp/src/Configs/Camera/Model';
import {ImageSubmissionRequest, IMAGE_SUBMISSION_HEIGHT, IMAGE_SUBMISSION_WIDTH, RecentRawFileSubmissionRequest} from '../webapp/src/Configs/Types';
import { feedWatchdog } from './Utils';

const raspiCamera = new Raspistill();
let g_tmLastRawImage = new Date().getTime();
const IMAGE_CADENCE = 20000;

if(process.argv.find((arg) => arg === "test-images")) {
  async function testProc() {

    const root = `./test-images`
    const imgs = fs.readdirSync(root);
    let lastPromise:Promise<any> = Promise.resolve();

    const modelToTest = {
      LatLng: {
        lat: 51.1985,
        lng: -114.487,
      } as LatLngModel,
      CurrentTime: {
        tm: new Date("2015-01-01T00:00:00-08:00"),
      }
    }

    for(var x = 0;x < imgs.length; x++) {
      await lastPromise;
      const img = imgs[x];
      if(img.includes( '.proc.jpg')) {
        continue;
      }

      const file = `${root}/${img}`;
      const buf = fs.readFileSync(file);
      const canvas = await ImageEffects.prepareCanvasFromBuffer(buf);

      let processed = await (lastPromise = ImageEffects.process(canvas, modelToTest));
      
      fs.writeFileSync(`${file}.proc.jpg`, processed.toBuffer());
    }

    await lastPromise;
  }
  testProc();
} else {


  function getApiUrl(api:string) {
    let base = 'http://fastsky.ca/api';
    if(platform() === 'win32') {
      base = 'http://localhost:2702';
    }

    return `${base}/${api}`;
  }

  let g_currentModels = {}; // the configured models from the database.  Gets updated on each image submission

  
  var webcamOpts = {
    width: IMAGE_SUBMISSION_WIDTH,
    height: IMAGE_SUBMISSION_HEIGHT,
    quality: 90,
    frames: 1,
    skip: 100,
    delay: 0,
    output: "jpeg",
    callbackReturn: "base64",
    verbose: true
  };
  var Webcam = NodeWebcam.create( webcamOpts );



  let config:any;
  try {  
    config = JSON.parse(fs.readFileSync('./config.json', 'utf8'));
  } catch(e) {
    console.log("You need to set up a config.json that includes {apiKey: 'your-api-key'}");
    process.exit(1);
  }

  const expSettings:ExposureSettings = new ExposureSettings();

  let raspiCameraValid = true;
  let webcamValid = true;
  let piFailuresInRow = 0;

  function getFromFsWebcam():Promise<Buffer> {

    const cameraModel:CameraModel = g_currentModels['Camera'] || new CameraModel();
    return new Promise((resolve, reject) => {
      console.log("fswebcam going to run with cameramodel ", cameraModel);
      const desiredAspect = IMAGE_SUBMISSION_WIDTH / IMAGE_SUBMISSION_HEIGHT;
      const w = Math.floor(IMAGE_SUBMISSION_HEIGHT * desiredAspect);
      const command = `fswebcam --jpeg 95 -S 50 -F 1 -r ${cameraModel.desiredW}x${cameraModel.desiredH} --scale ${w}x${IMAGE_SUBMISSION_HEIGHT} ./tmp/from-webcam.jpg`;
      console.log("Running fswebcam: ", command);
      exec(command, (err, stdout, stderr) => {
        if(err) {
          console.error("Error doing fswebcam: ", err);
          reject(err);
        } else {
          fs.readFile('./tmp/from-webcam.jpg', (err, data:Buffer) => {
            if(err) {
              console.error("Error reading from-webcam.jpg: ", err);
              reject(err);
            }

            try{
              fs.unlink('./tmp/from-webcam.jpg', () => {})
            } catch(e) {}

            feedWatchdog();
            resolve(data);
          });
        }
      })
    })
  }

  function cleanupDir(dir) {
    try {
      const photos = fs.readdirSync(dir);
      photos.forEach((photo) => {
        fs.unlinkSync(`${dir}/${photo}`);
      })
    } catch(e) {
      // this is fine.
    }

  }

  async function acquireRawImage():Promise<Buffer> {
    if(raspiCameraValid) {
      return expSettings.takePhoto().then(async (imageBuffer:Buffer) => {
        piFailuresInRow = 0;
        feedWatchdog();
        return imageBuffer;
      }).catch((failure) => {
        console.error("Error from raspi camera: ", failure);
        raspiCameraValid = false;
        return acquireRawImage();
      })
    } else if(webcamValid) {
      return getFromFsWebcam().then(async (imageBuffer:Buffer) => {
        feedWatchdog();
        return imageBuffer;
      }).catch((failure) => {
        console.log("failure from webcam attempt", failure);
        webcamValid = false;
        throw failure;
      })
    } else {
      // well crap
      return Promise.reject("No cameras are known to be working...");
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
    cleanupDir('./photos');
    cleanupDir('./tmp');
    
    const rawBuffer = await acquireRawImage();
    
    checkSaveRawImage(rawBuffer);
    
    console.log(elapsed(), "picture taken, doing processing");
    const canvas = await ImageEffects.prepareCanvasFromBuffer(rawBuffer);
    console.log("canvas prepared");

    await expSettings.analyzeRawImage(canvas);
    const processedImage = await ImageEffects.process(canvas, g_currentModels);
    const compressedImage = processedImage.toBuffer("image/jpeg", {quality: 90});
    console.log(elapsed(), "processing complete, and produced a ", compressedImage.byteLength, "-byte image");
    return compressedImage;
  }
        
  let submitPromise = Promise.resolve();
  let submitCount = 0;


  function takePictureLoop() {
    let mySubmitCount = submitCount++;

    console.log(elapsed(), mySubmitCount, "commanding to take one picture", raspiCameraValid, webcamValid);
    const tmStart = elapsed();
    const tmNext = tmStart + IMAGE_CADENCE;
    return captureAndProcessOneImage().then(async (data:Buffer) => {
      if(expSettings.lastWasExtreme) {
        return;
      }
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
            feedWatchdog();
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
      raspiCameraValid = true;
      webcamValid = true;
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
