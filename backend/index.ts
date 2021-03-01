import express from 'express';
import * as core from 'express-serve-static-core';
import {postStartup, setCorsHeaders, setUpCors} from './HttpUtils';
import Db from './Db';
import {initVideoMaker} from './VideoMaker';
import Image from 'image-js';

let app = <core.Express>express();

export interface PostRequest {
  apiKey:string;
}

export interface ImageSubmissionRequest extends PostRequest {
  imageBase64:string;
}
export interface ImageRequest {
  id:number;
}
export interface ImageResponse {
  mime:string;
  base64:string;
}

function handleSuccess(req:core.Request, res:core.Response) {
  return function(success) {
    res.writeHead(200, 'ok');
    res.write(JSON.stringify(success));
    res.end();
  }
}
function handleFailure(req:core.Request, res:core.Response) {
  return function(failure) {
    res.writeHead(500, 'failure');
    res.write(JSON.stringify(failure));
    res.end();
  }
}

app.post('/image-submission', (req:core.Request, res:core.Response) => {
  setCorsHeaders(req, res);
  return postStartup(req,res).then(async (query:ImageSubmissionRequest) => {

    // let's validate this image
    let image;
    if(query.imageBase64.startsWith('data:image')) {
      // good, that saves us reformatting it.
      image = await Image.load(query.imageBase64);

      // but now we have to slice off the pre-comma bits.
      query.imageBase64 = query.imageBase64.slice(query.imageBase64.indexOf(',')+1);
    } else {
      image = await Image.load(`data:image/jpeg;base64,${query.imageBase64}`);
    }
    if(image.width !== 1920 || image.height !== 1080) {
      debugger; // hey developer, something messed up!
      throw new Error("Image needs to be 1920x1080.  It's the browser-app's fault if not.");
    }
    return Db.imageSubmission(query);
  }).then(handleSuccess(req,res), handleFailure(req,res));
});
app.get('/image', (req:core.Request, res:core.Response) => {
  setCorsHeaders(req, res);
  return Db.getTestImage(req.query.id).then(handleSuccess(req,res), handleFailure(req,res));
});

setUpCors(app);
app.listen(2702);
console.log("weathertaker api serving on 2702");

initVideoMaker();