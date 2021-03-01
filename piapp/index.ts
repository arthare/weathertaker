import fetch from 'node-fetch';
import NodeWebcam from 'node-webcam';
import { platform } from 'os';
import fs from 'fs';
import {ImageSubmissionRequest} from '../types/http';

var opts = {

  //Picture related

  width: 1920,
  height: 1080,
  quality: 90,
  frames: 1,
  delay: 0,
  output: "jpeg",
  callbackReturn: "base64",
  verbose: true
};

let config:any;
try {  
  config = JSON.parse(fs.readFileSync('./config.json', 'utf8'));
} catch(e) {
  console.log("You need to set up a config.json that includes {apiKey: 'your-api-key'}");
  process.exit(1);
}

var Webcam = NodeWebcam.create( opts );

function takeOnePicture() {
  console.log("commanding to take one picture");
  return new Promise<void>((resolve) => {
    Webcam.capture( "test_picture", ( err, data ) => {
      console.log("got result from one picture ", data?.length);
      if(err) {
        console.error(err);
        return resolve();
      } else if(data) {
        let base = 'http://172.105.26.34/api';
        if(platform() === 'win32') {
          base = 'http://localhost:2702';
        }
        let url = `${base}/image-submission`;
    
        const request:ImageSubmissionRequest = {
          apiKey: config.apiKey,
          imageBase64: data,
        }
        return fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(request),
        }).then((response) => {
          if(!response.ok) {
            throw response;
          } else {
            return response.json();
          }
        }).catch((failure) => {
          // oh well...
        }).finally(resolve);
      }
    });

  }).finally(() => {
    setTimeout(takeOnePicture, 15000);
  })

}
takeOnePicture();