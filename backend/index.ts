import express from 'express';
import * as core from 'express-serve-static-core';
import {postStartup} from './HttpUtils';
import Db from './Db';

let app = <core.Express>express();

export interface PostRequest {
  apiKey:string;
}

export interface ImageSubmissionRequest extends PostRequest {
  imageBase64:string;
}

app.post('/image', (req:core.Request, res:core.Response) => {
  return postStartup(req,res).then((query:ImageSubmissionRequest) => {

    return Db.imageSubmission(query);
  })
})


app.listen(2702);
