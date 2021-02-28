import mysql from 'mysql2';
import fs from 'fs';
import config from './db-config';
import {ImageSubmissionRequest} from './index';
import { cwd } from 'process';
import { v4 as uuidv4 } from 'uuid';
import atob from 'atob';

interface SourceInfo {
  handle:string;
  id:number;
}


function getDb():Promise<mysql.Connection> {

  function reconnect():Promise<mysql.Connection> {
      return new Promise((resolve, reject) => {
          const connection = mysql.createConnection(config);
          resolve(connection);
      })
  }
  return reconnect();
}


export default class Db {

  static validateApiKey(apiKey:string):Promise<SourceInfo> {
    // gotta make sure this API key is valid.
    return getDb().then((db) => {
      return new Promise<SourceInfo>((resolve, reject) => {
        db.execute(`select id,handle from sources where apikey=?`, [apiKey], (err, results:any[]) => {
          if(err) {
            reject(err);
          } else if(results.length === 1) {
            resolve(results[0]);
          } else {
            console.error("Results for apikey had length !== 1");
            reject(new Error("Something went wrong"));
          }
        })
      }).finally(() => {
        db.end();
      })
    })
  }

  static imageSubmission(imageSubmissionRequest:ImageSubmissionRequest):Promise<void> {

    return Db.validateApiKey(imageSubmissionRequest.apiKey).then((sourceInfo:SourceInfo) => {
      // well, if it resolved, then this image has a source for a home!
      const rootPath = `${cwd()}/images/${sourceInfo.handle}/`;
      try {
        fs.mkdirSync(rootPath);
      } catch(e) {}

      const filename = uuidv4();
      const buffer = atob(imageSubmissionRequest.imageBase64);
      const finalPath = `${rootPath}${filename}.jpg`;
      fs.writeFileSync(finalPath, buffer);

      // ok, the image is stored on disk.  let's put the reference in the DB
      return getDb().then((db) => {
        return new Promise<void>((resolve, reject) => {
          db.execute('insert into images (sourceid,filename,unixtime) values (?,?,?)', [sourceInfo.id, finalPath, new Date().getTime()/1000], (err, results) => {
            if(err) {
              reject(err);
            } else {
              resolve();
            }
          })
        })
      })

    });
  }
}