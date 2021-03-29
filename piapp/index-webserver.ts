import * as core from 'express-serve-static-core';
import express from 'express';
import fs from 'fs';
import { takeImageAsap } from './index-pictureloop';

export function setupLocalApi() {
  let app = <core.Express>express();
  
  app.get('/last-image', (req:core.Request, res:core.Response) => {

    takeImageAsap();

    try {
      const file = process.cwd() + '/tmp/from-camera.jpg';
      console.log("sending file ", file);
      res.sendFile(file);
    } catch(e) {
      console.error("Error at last-image: ", e);
      res.writeHead(404, 'no-image');
      res.write(JSON.stringify({err: e.message}));
      res.end();
    }
  })
  
  
  
  app.listen(8080);
  console.log("piapp API running at 8080");

}