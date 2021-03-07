import mysql from 'mysql2';
import fs from 'fs';
import {ImageResponse, ImageSubmissionRequest} from './index';
import { cwd } from 'process';
import { v4 as uuidv4 } from 'uuid';
import atob from 'atob';
import {guaranteePath} from './FsUtils';
import md5 from 'md5';
import { notifyDirtySource } from './VideoMaker';

const config = JSON.parse(fs.readFileSync('./db-config.json', 'utf8'));

export interface SourceInfo {
  handle:string;
  id:number;
}

export interface ImageInfo {
  filename:string;
  tmTaken:number;
  id:number;
}

export interface InsertVideo {
  sourceId:number;
  imageIds:number[];
  filename:string;
}

export interface VideoInfo {
  id:number;
  filename:string;
  sourceId:number;
  handle:string;
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

  static getSourceInfo(sourceId:number):Promise<SourceInfo> {
    return getDb().then((db) => {
      return new Promise<SourceInfo>((resolve, reject) => {
        db.execute(`select id,handle from sources where id=?`, [sourceId], (err, results:any[]) => {
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

  static imageSubmission(imageSubmissionRequest:ImageSubmissionRequest):Promise<number> {

    return Db.validateApiKey(imageSubmissionRequest.apiKey).then((sourceInfo:SourceInfo) => {

      return getDb().then((db) => {
        return new Promise<number>((resolve, reject) => {

          const md5Result = md5(imageSubmissionRequest.imageBase64);
          const filename = `${process.cwd()}/images/${sourceInfo.handle}/${md5Result}.jpg`;
          guaranteePath(filename);
          fs.writeFileSync(filename, imageSubmissionRequest.imageBase64, 'base64');


          db.execute('insert into images (sourceid,unixtime,filename) values (?,?,?)', [sourceInfo.id, Math.floor(new Date().getTime()/1000), filename], (err, insertResult:any) => {
            if(err) {
              reject(err);
            } else {
              console.log("inserted image ", insertResult?.insertId);
              const newFilename = `${process.cwd()}/images/${sourceInfo.handle}/${insertResult.insertId}.jpg`;
              fs.renameSync(filename, newFilename);
              db.execute('update images set filename=? where id=?', [newFilename, insertResult.insertId], (err, renameResult:any) => {
                if(err) {
                  reject(err);
                } else {
                  resolve(insertResult.insertId);
                  notifyDirtySource(sourceInfo.id);
                }
              })
            }
          })
        }).finally(() => db.end());
      })

    });
  }

  private static createVideoId(sourceId:number, filename:string):Promise<number> {

    if(!fs.existsSync(filename)) {
      throw new Error("Video doesn't exist on-disk");
    }

    return getDb().then((db) => {
      return new Promise<number>((resolve, reject) => {
        db.execute('insert into videos (sourceid,filename) values (?,?)', [sourceId, filename], (err, result:any) => {
          if(err) {
            reject(err);
          } else {
            resolve(result.insertId);
          }
        })
      }).finally(() => db.end());
    })

  }
  private static async createVideoImages(videoId:number, imageIds:number[]):Promise<number> {

    return getDb().then((db) => {
      return new Promise<number>((resolve, reject) => {

        const rows = imageIds.map((imgId) => [videoId, imgId]);

        db.query('insert into images_in_videos (videoid,imageid) values ?', [rows], (err, result:any) => {
          if(err) {
            reject(err);
          } else {
            resolve(result.insertId);
          }
        })
      }).finally(() => db.end());
    })

  }

  static async insertVideo(createdVideo:InsertVideo):Promise<number> {
    const videoId = await Db.createVideoId(createdVideo.sourceId, createdVideo.filename);

    await Db.createVideoImages(videoId, createdVideo.imageIds);

    return videoId;
  }
  static getRecentImages(tmNow:number, spanSeconds:number, sourceId:number):Promise<ImageInfo[]> {
    return getDb().then((db) => {
      return new Promise<ImageInfo[]>((resolve, reject) => {
        const msStart = tmNow - spanSeconds*1000;
        const unixStart = msStart / 1000;
        db.execute('select id,filename,unixtime from images where sourceid=? and unixtime>? order by unixtime asc', [sourceId, unixStart], (err, result:any[]) => {
          if(err) {
            reject(err);
          } else {
            resolve(result.map((res) => {
              return {
                filename: res.filename,
                tmTaken: res.unixtime*1000,
                id: res.id,
              }
            }));
          }
        })
      }).finally(() => db.end());
    })
  }

  static getVideo(id:number|null):Promise<VideoInfo> {

    return getDb().then((db) => {
      return new Promise<VideoInfo>((resolve, reject) => {

        let q;
        let args = [];
        if(id !== null) {
          q = `select filename,sourceid,videos.id,sources.handle as handle from videos,sources where videos.sourceid=sources.id and videos.id=?`;
          args = [id];
        } else {
          q = `select filename,sourceid,videos.id,sources.handle as handle from videos,sources where videos.sourceid=sources.id order by id desc limit 1`;
          args = [];
        }

        db.execute(q, args, (err, result:any[]) => {
          if(err) {
            reject(err);
          } else if(result.length === 1) {
            let filename:string = result[0].filename;

            if(filename) {
              const ixLastSlash = filename.lastIndexOf('/');
              filename = filename.slice(ixLastSlash+1);
              resolve({
                filename,
                id: result[0].id,
                sourceId: result[0].sourceid,
                handle: result[0].handle,
              } as VideoInfo);
            }
          } else {
            reject(new Error("No videos found"));
          }
        })
      }).finally(() => db.end());
    })
  }

  static async markVideoRemoved(id:number):Promise<any> {
    return getDb().then((db) => {
      return new Promise<void>((resolve, reject) => {
        db.execute('update videos set removed=1 where id=?', [id], (err, results:any[]) => {
          if(err) {
            console.log("failed to mark video ", id, " as missing");
            reject(err);
          } else {
            console.log("marked video ", id, " as missing");
            resolve();
          }
        })
      }).finally(() => db.end());
    })
  }

  static async checkRemovedVideos():Promise<any> {
    const activeVideos = await this.getActiveVideoInfos();

    let updateIds = [];
    activeVideos.forEach((video) => {
      if(!fs.existsSync(video.filename)) {
        console.log("video ", video.filename, " doesn't exist.  We will remove it");
        updateIds.push(video.id);
      }
    });

    console.log("We noticed that these videos IDs are missing: ", updateIds);
    updateIds.forEach(async (id) => {
      await Db.markVideoRemoved(id);
    })
  }

  static getActiveVideoInfos():Promise<VideoInfo[]> {
    // this returns the "leader" videos for every handle.  if it's not a leader, the file can be deleted.
    return getDb().then((db) => {
      return new Promise<VideoInfo[]>((resolve, reject) => {
        db.execute('select filename,sourceid,videos.id,sources.handle from videos,sources where videos.sourceid=sources.id and videos.removed=0 order by videos.id desc ', [], (err, results:any[]) => {
          if(err) {
            reject(err);
          } else {
            const asVideoInfos = results.map((video) => {
              let filename:string = video.filename;
  
              if(filename) {
                const ixLastSlash = filename.lastIndexOf('/');
                filename = filename.slice(ixLastSlash+1);
                return {
                  filename,
                  id: video.id,
                  sourceId: video.sourceid,
                  handle: video.handle,
                } as VideoInfo;
              }
            })

            resolve(asVideoInfos);
          }
        })
      }).finally(() => db.end());
    })

  }

  static getTestImage(id:number):Promise<ImageResponse> {
    
    return getDb().then((db) => {
      return new Promise<ImageResponse>((resolve, reject) => {
        db.execute('select filename from images where id=? and sourceid=2', [id], (err, result:any[]) => {
          if(err) {
            reject(err);
          } else {
            const filename = result[0].filename;
            if(filename && fs.existsSync(filename)) {
              resolve({
                base64: fs.readFileSync(filename, 'base64'),
                mime: 'image/jpeg',
              } as ImageResponse);
            }
          }
        })
      }).finally(() => db.end());
    })
  }
}