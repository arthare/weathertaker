import * as core from 'express-serve-static-core';
import express from 'express';
import fs from 'fs';
import { takeImageAsap } from './index-pictureloop';

export function setupLocalApi() {

  let oldConsoleLog = console.log;
  let lastConsoles:any[][] = [];
  console.log = function() {
    oldConsoleLog.apply(console, arguments);
    lastConsoles.push([...arguments]);
    while(lastConsoles.length > 300) {
      lastConsoles.shift();
    }
  }


  let app = <core.Express>express();
  
  app.get('/last-image', (req:core.Request, res:core.Response) => {

    takeImageAsap();

    try {
      const file = process.cwd() + '/tmp/last-image.jpg';
      console.log("sending file ", file);
      res.sendFile(file);
    } catch(e) {
      console.error("Error at last-image: ", e);
      res.writeHead(404, 'no-image');
      res.write(JSON.stringify({err: e.message}));
      res.end();
    }
  })
  app.get('/logs', (req:core.Request, res:core.Response) => {

    takeImageAsap();

    try {
      const file = process.cwd() + '/tmp/last-image.jpg';
      
      let lines = lastConsoles.map((lc) => {
        return `<tr>` + lc.map((col) => `<td>${JSON.stringify(col)}</td>`) + `</tr>`;
      });

      let html = `<table style="width:90vw;" border=1>${lines.join('\n')}</table>`
      res.write(html);
      res.end();

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