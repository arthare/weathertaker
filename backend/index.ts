import express from 'express';
import * as core from 'express-serve-static-core';
import {postStartup, setCorsHeaders, setUpCors} from './HttpUtils';
import Db, { VideoInfo } from './Db';
import {initVideoMaker} from './VideoMaker';
import Image from 'image-js';
import fs from 'fs';
import {ImageSubmissionRequest, IMAGE_SUBMISSION_HEIGHT, ReactionType, ReactSubmission} from '../types/http';
import { resolveNaptr } from 'dns';

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

console.log("about to create download-video");
app.get('/download-video', (req:core.Request, res:core.Response) => {
  setCorsHeaders(req, res);
  if(req.query.id) {
    console.log("you asked for id ", req.query.id);
    return Db.getVideo(req.query.id).then((videoInfo:VideoInfo) => {
      console.log("video info for that is ", videoInfo);
      const localVideoPath = `./videos/${videoInfo.handle}/${videoInfo.filename}`;
      if(fs.existsSync(localVideoPath)) {
        console.log("transferring video with res.download");
        res.download(localVideoPath);
      } else {
        console.log("and the file at ", localVideoPath, " does not exist!");
        res.writeHead(404, 'not-found');
        res.end();
      }
    }, (failure) => {
      console.log("Failed to find video info for ", req.query.id, ": ", failure);
      res.writeHead(404, 'not-found');
      res.end();
    })

    
  } else {
    console.log("Failed to find video info for ", req.query.id, ": ");
    res.writeHead(404, 'not-found');
    res.end();
  }
});

app.get('/reaction-count', (req:core.Request, res:core.Response) => {
  setCorsHeaders(req, res);
  if(req.query.videoId) {
    return Db.getReactionCountsForVideo(req.query.videoId).then((counts) => {
      handleSuccess(req,res)(counts);
    }, (failure) => {
      handleFailure(req,res)(failure);
    })
  } else {
    console.log("Failed to find reaction count for videoid ", req.query.videoId, ": ");
    res.writeHead(404, 'not-found');
    res.end();
  }
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
    if(image.height !== IMAGE_SUBMISSION_HEIGHT) {
      debugger; // hey developer, something messed up!
      throw new Error(`Image needs to be ${IMAGE_SUBMISSION_HEIGHT} pixels high.  It's the browser-app's fault if not.`);
    }
    return Db.imageSubmission(query);
  }).then(handleSuccess(req,res), (failure) => {
    console.log("image-submission failure: ", failure && failure.message);
    handleFailure(req,res)(failure);
  })
});

app.post('/react', (req:core.Request, res:core.Response) => {
  setCorsHeaders(req, res);
  return postStartup(req,res).then(async (query:ReactSubmission) => {
    let ip = req.headers['x-forwarded-for'] || req.ip; // x-forwarded-for is because on the server we're living behind a proxy

    if(query.how === ReactionType.Download) {
      // if they're downloading, don't replace their other reactions
      ip += '-download';
    }

    console.log("ip to use: ", ip);
    return Db.submitReaction(query.how, ip as string, query.videoId);
  }).then(handleSuccess(req,res), handleFailure(req,res));

})

app.get('/image', (req:core.Request, res:core.Response) => {
  setCorsHeaders(req, res);
  return Db.getTestImage(req.query.id).then(handleSuccess(req,res), handleFailure(req,res));
});

setUpCors(app);
app.listen(2702);
console.log("weathertaker api serving on 2702 qwer");

initVideoMaker();