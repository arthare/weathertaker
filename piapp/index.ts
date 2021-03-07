import fetch from 'node-fetch';
import NodeWebcam from 'node-webcam';
import { platform } from 'os';
import fs from 'fs';
import {ImageSubmissionRequest} from '../types/http';
import {Raspistill} from 'node-raspistill';
import {ExposureSettings} from './ExposureSettings';
import ImageJs from 'image-js';
const raspiCamera = new Raspistill();
 

var webcamOpts = {
  width: 1280,
  height: 720,
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
function captureFromCurrentCamera():Promise<Buffer> {
  if(raspiCameraValid) {
    expSettings.setupCamera(raspiCamera);
    return raspiCamera.takePhoto().then(async (image:Buffer) => {

      image = await expSettings.analyzeAndLevelImage(image);

      return image;
    }, (failure) => {
      // hmmm, I guess the raspi camera isn't here?
      //try from the webcam.
      console.error("Error from raspi camera: ", failure);
      raspiCameraValid = false;
      return captureFromCurrentCamera();
    })
  } else if(webcamValid) {
    return new Promise<Buffer>((resolve, reject) => {
      Webcam.capture( "test_picture", ( err, data:string ) => {
        if(err) {
          reject(err);
        } else {
          resolve(Buffer.from(data, 'base64'));
        }
      });
    }).catch((failure) => {
      webcamValid = false;
      throw failure;
    })
  } else {
    // well crap
    return Promise.reject("No cameras are known to be working...");
  }
}

function takeOnePicture() {
  console.log("commanding to take one picture");
  return captureFromCurrentCamera().then((data:Buffer) => {
    let base = 'http://172.105.26.34/api';
    if(platform() === 'win32') {
      base = 'http://localhost:2702';
    }
    let url = `${base}/image-submission`;

    const request:ImageSubmissionRequest = {
      apiKey: config.apiKey,
      imageBase64: data.toString('base64'),
    }
    return fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    }).then((response) => {
      if(!response.ok) {
        console.log("website said bad");
        throw response;
      } else {
        console.log("posted successfully!");
        return response.json();
      }
    }).catch((failure) => {
      // oh well...
    })

  }).catch((failure) => {
    console.error("Failure to capture: ", failure);
  }).finally(() => {
    setTimeout(takeOnePicture, 15000);
  })

}
takeOnePicture();