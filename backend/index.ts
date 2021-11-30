import express from 'express';
import * as core from 'express-serve-static-core';
import {postStartup, setCorsHeaders, setUpCors} from './HttpUtils';
import Db, { ImageInfo, SourceInfo, VideoInfo } from './Db';
import {initVideoMaker} from './VideoMaker';
import Image from 'image-js';
import fs from 'fs';
import { resolveNaptr } from 'dns';
import {GetConfigResponse, ImageSubmissionRequest, IMAGE_SUBMISSION_HEIGHT, IMAGE_SUBMISSION_WIDTH, NewModelRequest, ReactionType, ReactSubmission, RecentRawFileRequest, RecentRawFileSubmissionRequest} from '../webapp/src/Configs/Types'


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
app.get('/next-source', (req:core.Request, res:core.Response) => {

  setCorsHeaders(req, res);
  return Db.getNextSource(parseInt(req.query.id)).then(handleSuccess(req,res), handleFailure(req,res));

});
app.get('/source', (req:core.Request, res:core.Response) => {
  // fetch the video metadata and send it to the browser, who can then decide what to do
  setCorsHeaders(req, res);
  return Db.getSourceInfo(req.query.id).then(handleSuccess(req,res), handleFailure(req,res));

});
app.get('/video', (req:core.Request, res:core.Response) => {
  // fetch the video metadata and send it to the browser, who can then decide what to do
  setCorsHeaders(req, res);
  if(req.query.sourceId) {
    return Db.getMostRecentVideoOfSource(req.query.sourceId).then(handleSuccess(req,res), handleFailure(req,res));
  } else if(req.query.sourceHandle) {
    return Db.getMostRecentVideoOfSourceByHandle(req.query.sourceHandle).then(handleSuccess(req,res), handleFailure(req,res));
  } else {
    return Db.getVideo(req.query.id || null).then(handleSuccess(req,res), handleFailure(req,res));
  }

});
app.post('/models', (req:core.Request, res:core.Response) => {
  return postStartup(req, res).then(async (modelUpdate:NewModelRequest) => {
    const currentModel = await Db.getCurrentModels(modelUpdate.sourceId);
    for(var key in modelUpdate.model) {
      switch(key) {
        case 'pwd':
        case 'model':
        case 'sourceId':
          break;
        default:
          currentModel[key] = modelUpdate.model[key];
          break;
      }
    }
    modelUpdate.model = currentModel;
    return Db.setCurrentModels(modelUpdate);
  }).then(handleSuccess(req,res), handleFailure(req,res));
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


app.get('/last-image', async (req:core.Request, res:core.Response) => {
  setCorsHeaders(req, res);

  const image:ImageInfo = await Db.getLastImageFromSource(req.query.sourceId);
  
  if(fs.existsSync(image.filename)) {
    console.log("transferring video with res.download");
    res.download(image.filename);
  } else {
    handleFailure(req,res)(new Error("Image doesn't actually exist"));
  }
  
});

app.get('/config', async (req:core.Request, res:core.Response) => {
  setCorsHeaders(req, res);

  try {
    const source = await Db.getSourceInfo(req.query.sourceId);
    const models = await Db.getCurrentModels(req.query.sourceId);

    let noon;
    let night;
    try {
      noon = await Db.getRawFile({when: 'noon', sourceId: source.id});
    } catch(e) {};
    
    try {
      night = await Db.getRawFile({when: 'night', sourceId: source.id});
    } catch(e) {};
    

    const ret:GetConfigResponse = {
      models,
      noonBase64: noon && noon.toString('base64'),
      nightBase64: night && night.toString('base64'),
    }
    handleSuccess(req,res)(ret);
  } catch(e) {
    handleFailure(req,res)(e);
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

app.post('/recent-raw-file-submission', (req:core.Request, res:core.Response) => {
  console.log("someone is sending us a unmodified file");
  setCorsHeaders(req, res);
  return postStartup(req,res).then(async (query:RecentRawFileSubmissionRequest) => {
    return Db.updateRawFile(query).then(handleSuccess(req,res), handleFailure(req,res));

  });
});
app.get('/recent-raw-file', (req:core.Request, res:core.Response) => {
  console.log("someone is requesting the raw files for source ", req.query);
  setCorsHeaders(req, res);
  return Db.updateRawFile(req.query).then(handleSuccess(req,res), handleFailure(req,res));
});

app.post('/image-submission', (req:core.Request, res:core.Response) => {
  setCorsHeaders(req, res);
  return postStartup(req,res).then(async (query:ImageSubmissionRequest) => {
    try {
      const source = await Db.validateApiKey(query.apiKey);
      
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
      if(image.height !== IMAGE_SUBMISSION_HEIGHT && image.width !== IMAGE_SUBMISSION_WIDTH) {
        debugger; // hey developer, something messed up!
        throw new Error(`Image from ${source.name} / ${source.id} needs to be ${IMAGE_SUBMISSION_WIDTH} x ${IMAGE_SUBMISSION_HEIGHT} pixels but it was ${image.width} x ${image.height}`);
      }
      return Db.imageSubmission(query).then(async (submit) => {
        return {
          submit,
          models: await Db.getCurrentModels(source.id),
        }
      });

    } catch(e) {

    }
  }).then(handleSuccess(req,res), (failure) => {
    console.log("image-submission failure: ", failure && failure.message);
    handleFailure(req,res)(failure);
  })
});

app.post('/react', (req:core.Request, res:core.Response) => {
  console.log("Someone is posting a reaction");
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