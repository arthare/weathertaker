import express from 'express';
import * as core from 'express-serve-static-core';
import {postStartup, setCorsHeaders, setUpCors} from './HttpUtils';
import Db, { VideoInfo } from './Db';
import {initVideoMaker} from './VideoMaker';
import Image from 'image-js';

let app = <core.Express>express();

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

app.get('/video', (req:core.Request, res:core.Response) => {
  // fetch the video metadata and send it to the browser, who can then decide what to do
  setCorsHeaders(req, res);
  return Db.getVideo(req.query.id || null).then(handleSuccess(req,res), handleFailure(req,res));

});

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
    console.log("loaded ", image.width + " x " + image.height + " image");
    if(image.width !== 1280 || image.height !== 720) {
      debugger; // hey developer, something messed up!
      throw new Error("Image needs to be 1280x720.  It's the browser-app's fault if not.");
    }
    return Db.imageSubmission(query);
  }).then(handleSuccess(req,res), (failure) => {
    console.log("image-submission failure: ", failure && failure.message);
    handleFailure(req,res)(failure);
  })
});
app.get('/image', (req:core.Request, res:core.Response) => {
  setCorsHeaders(req, res);
  return Db.getTestImage(req.query.id).then(handleSuccess(req,res), handleFailure(req,res));
});

setUpCors(app);
app.listen(2702);
console.log("weathertaker api serving on 2702");

initVideoMaker();