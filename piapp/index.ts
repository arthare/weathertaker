import fetch from 'node-fetch';
import NodeWebcam from 'node-webcam';
import { platform } from 'os';
import fs from 'fs';
import {ImageSubmissionRequest, IMAGE_SUBMISSION_HEIGHT, IMAGE_SUBMISSION_WIDTH} from '../types/http';
import {Raspistill} from 'node-raspistill';
import {ExposureSettings} from './ExposureSettings';
import {Image as ImageJs} from 'image-js';
import { exec, execSync } from 'child_process';
import {ImageEffects} from './ImageEffects';
import { elapsed } from '../webapp/src/Configs/Utils';
import { LatLngModel } from '../webapp/src/Configs/LatLng/Model';

const raspiCamera = new Raspistill();

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

    return new Promise((resolve, reject) => {
      const desiredAspect = IMAGE_SUBMISSION_WIDTH / IMAGE_SUBMISSION_HEIGHT;
      const w = Math.floor(IMAGE_SUBMISSION_HEIGHT * desiredAspect);
      const command = `fswebcam --jpeg 95 -S 50 -F 1 -r 1280x720 --scale ${w}x${IMAGE_SUBMISSION_HEIGHT} ./tmp/from-webcam.jpg`;
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
      console.log("Failed to clean up photos directory: ", e);
    }

  }

  async function captureFromCurrentCamera():Promise<Buffer> {
    
    try {
      fs.mkdirSync('./tmp');
    } catch(e) {
      // hope it already exists...
    }
    cleanupDir('./photos');
    cleanupDir('./tmp');
    

    async function takePicture():Promise<Buffer> {
      if(raspiCameraValid) {
        return expSettings.takePhoto().then(async (imageBuffer:Buffer) => {
          piFailuresInRow = 0;
          return imageBuffer;
        }).catch((failure) => {
          // hmmm, I guess the raspi camera isn't here?
          //try from the webcam.
          piFailuresInRow++;
          if(piFailuresInRow > 5) {
            console.log("5 pi camera failures in a row.  rebooting");
            execSync("sudo reboot");
            return;
          }
          console.error("Error from raspi camera: ", failure);
          raspiCameraValid = false;
          return takePicture();
        })
      } else if(webcamValid) {
        return getFromFsWebcam().then(async (imageBuffer:Buffer) => {
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

    
    const buffer = await takePicture();
    console.log(elapsed(), "picture taken, doing processing");
    const canvas = await ImageEffects.prepareCanvasFromBuffer(buffer);
    console.log("canvas prepared");

    await expSettings.analyzeRawImage(canvas);
    const processedImage = await ImageEffects.process(canvas, g_currentModels);
    const compressedImage = processedImage.toBuffer("image/jpeg", {quality: 90});
    console.log(elapsed(), "processing complete, and produced a ", compressedImage.byteLength, "-byte image");
    return compressedImage;
  }
        
  let submitPromise = Promise.resolve();
  let submitCount = 0;


  function takeOnePicture() {
    let mySubmitCount = submitCount++;

    console.log(elapsed(), mySubmitCount, "commanding to take one picture", raspiCameraValid, webcamValid);
    const tmStart = elapsed();
    const tmNext = tmStart + IMAGE_CADENCE;
    return captureFromCurrentCamera().then(async (data:Buffer) => {
      if(expSettings.lastWasExtreme) {
        return;
      }
      console.log(elapsed(), mySubmitCount, "image captured");
      let base = 'http://fastsky.ca/api';
      if(platform() === 'win32') {
        base = 'http://localhost:2702';
      }
      let url = `${base}/image-submission`;

      

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
      setTimeout(takeOnePicture, msUntil);
    })

  }
  takeOnePicture();

}
