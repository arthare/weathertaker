import express from 'express';
import * as core from "express-serve-static-core";

export function setCorsHeaders(req:core.Request, res:core.Response) {
  res.setHeader('Access-Control-Allow-Origin', req.headers['origin'] || req.headers['Host'] || 'tourjs.ca');
  res.setHeader('Access-Control-Allow-Headers', '*');
}

export function setUpCors(app:core.Express) {
  
  app.options('*', (req:core.Request, res:any) => {
    setCorsHeaders(req, res);
    
    res.end();
  })
}

// CORS requires a single origin to be returned.  This looks at the request and returns the correct one
function handleCors(req:core.Request, accessControlAllowOrigin:Array<string>):string {

  const reqOrigin = req.headers['origin'];
  const found:string|undefined = accessControlAllowOrigin.find((origin) => {
      return origin === reqOrigin;
  });

  if(found) {
      return found;
  }

  return '';
}
export function postStartup(req:core.Request, res:core.Response):Promise<any> {
    
  return new Promise((resolve, reject) => {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Access-Control-Allow-Origin', handleCors(req, ["https://tourjs.ca", "https://www.tourjs.ca"]));
      res.setHeader('Access-Control-Allow-Headers', '*');
      var body = [];
      req.on('data', (chunk:any) => {
          body.push(chunk);
      });
      req.on('end', () => {
          const rawString:string = Buffer.concat(body).toString('utf8');
          const parsed:any = JSON.parse(rawString);
          resolve(parsed);
      });
  })
}

