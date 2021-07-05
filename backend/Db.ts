import mysql from 'mysql2';
import fs from 'fs';
import {ImageResponse} from './index';
import { cwd } from 'process';
import { v4 as uuidv4 } from 'uuid';
import atob from 'atob';
import {guaranteePath} from './FsUtils';
import md5 from 'md5';
import { notifyDirtySource } from './VideoMaker';
import { platform } from 'os';
import { rejects } from 'assert';
import { ImageSubmissionRequest, ReactionType, RecentRawFileRequest, RecentRawFileSubmissionRequest } from '../webapp/src/Configs/Types';

const config = JSON.parse(fs.readFileSync('./db-config.json', 'utf8'));

export interface SourceInfo {
  handle:string;
  id:number;
  description:string;
  name:string;
  nextHandle:string;
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
  tmStart:number;
  tmEnd:number;
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

function getPathToVideo(videoInfo:VideoInfo) {
  return `./videos/${videoInfo.handle}/${videoInfo.filename}`;
}

export default class Db {

  static getAllSources():Promise<SourceInfo[]> {
    return getDb().then((db) => {
      return new Promise<SourceInfo[]>((resolve, reject) => {
        db.execute(`select id,handle,name,description from sources`, [], (err, results:any[]) => {
          if(err) {
            reject(err);
          } else {
            resolve(results);
          }
        })
      }).finally(() => {
        db.end();
      })
    })
  }
  static getSourceInfo(sourceId:number):Promise<SourceInfo> {
    console.log("they're asking for source info from ", sourceId);
    return getDb().then((db) => {
      return new Promise<SourceInfo>((resolve, reject) => {
        db.execute(`select id,handle,name,description from sources where id=?`, [sourceId], (err, results:any[]) => {
          if(err) {
            reject(err);
          } else if(results.length === 1) {
            resolve(results[0]);
          } else {
            console.error(`Results for sourceinfo ${sourceId} had length !== ${results.length}`);
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
            console.error(`Results for apikey '${apiKey}' had length !== 1`);
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
              console.log(`inserted image ${insertResult?.insertId} from localip ${(imageSubmissionRequest.localIp || '').trim()} into source ${sourceInfo.handle} / ${sourceInfo.id} with size ${imageSubmissionRequest.imageBase64.length}`);
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

  private static createVideoId(sourceId:number, filepath:string, tmStart:number, tmEnd:number):Promise<number> {

    if(!fs.existsSync(filepath)) {
      throw new Error("Video doesn't exist on-disk");
    }

    return getDb().then((db) => {
      return new Promise<number>((resolve, reject) => {
        db.execute('insert into videos (sourceid,filename,removed, tmStart, tmEnd) values (?,?,0,?,?)', [sourceId, filepath, tmStart, tmEnd], (err, result:any) => {
          if(err) {
            reject(err);
          } else {
            console.log("inserted new video: ", filepath, " @ id ", result.insertId);
            resolve(result.insertId);
          }
        })
      }).finally(() => db.end());
    })

  }

  public static async submitReaction(how:ReactionType, ip:string, videoId:number|string):Promise<any> {
    
    return getDb().then((db) => {
      return new Promise<number>((resolve, reject) => {
        db.execute('insert into reactions (videoid,reactionid,srcip,tm) values (?,?,?,unix_timestamp()) on duplicate key update reactionid=?', [videoId, how, ip, how], (err, result:any) => {
          if(err) {
            console.error("Tried to insert reaction ", how, ip, videoId, " but failed: ", err);
            reject(err);
          } else {
            console.log(`inserted reaction ${how} to video ${videoId} from ip ${ip}`);
            resolve(result);
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
    const videoId = await Db.createVideoId(createdVideo.sourceId, createdVideo.filename, createdVideo.tmStart, createdVideo.tmEnd);

    console.log(`inserting video ${createdVideo.filename} for source #${createdVideo.sourceId} with ${createdVideo.imageIds.length} frames`);
    await Db.createVideoImages(videoId, createdVideo.imageIds);

    return videoId;
  }
  static getRecentImages(tmNow:number, spanSeconds:number, sourceId:number):Promise<ImageInfo[]> {
    return getDb().then((db) => {
      return new Promise<ImageInfo[]>((resolve, reject) => {
        db.execute('select id,filename,unixtime from images where sourceid=? order by unixtime desc limit 600', [sourceId], (err, result:any[]) => {
          if(err) {
            console.error("getRecentImages error", err);
            reject(err);
          } else {

            if(result.length > 0) {
              console.log("getRecentImages: Found " + result.length + " images");

              result.sort((a, b) => a.unixtime < b.unixtime ? -1 : 1); // sort so oldest goes first
              resolve(result.map((res) => {
                return {
                  filename: res.filename,
                  tmTaken: res.unixtime*1000,
                  id: res.id,
                }
              }));
            } else {
              resolve([]);
            }
          }
        })
      }).finally(() => db.end());
    })
  }

  static async updateRawFile(query:RecentRawFileSubmissionRequest):Promise<any> {
    // the raw files allow us to do editing previews in the webapp

    const source = await Db.validateApiKey(query.apiKey);
    // let's save the file
    const path = `./images/${source.handle}/raw-${query.when}.jpg`;
    fs.writeFile(path, Buffer.from(query.imageBase64, 'base64'), (err) => {
      if(err) {
        throw (err);
      } else {
        // file saved!  since it's a fixed path only depending on noon or night for a given handle, we don't actually have to have this in the DB.
      }
    });
  }
  static async getRawFile(query:RecentRawFileRequest):Promise<Buffer> {
    const source = await Db.getSourceInfo(query.sourceId);

    const path = `./images/${source.handle}/raw-${query.when}.jpg`;
    return new Promise((resolve, reject) => {
      fs.readFile(path, (err, data:Buffer) => {
        if(err) {
          reject(err);
        } else {
          resolve(data);
        }
      })
    })
  }

  static async getLastImageFromSource(sourceId:number|string):Promise<ImageInfo> {
    const db = await getDb();

    return new Promise((resolve, reject) => {
      db.execute('select id,filename,unixtime from images where sourceid=? order by unixtime desc limit 1', [sourceId], (err, results:any[]) => {
        if(err) {
          reject(err);
        } else if(results.length === 1) {
          resolve(results.map((res) => {
            return {
              filename: res.filename,
              tmTaken: res.unixtime*1000,
              id: res.id,
            }
          })[0]);
        } else {
          throw new Error("Could not find image");
        }
      })
    })
  }

  static async getCurrentModels(sourceId:number):Promise<any> {
    const db = await getDb();

    return new Promise((resolve, reject) => {
      db.execute(`select models from sources where sources.id=?`, [sourceId], (err, results:any[]) => {
        if(err) {
          reject(err);
        } else if(results.length === 1) {
          try {
            resolve(JSON.parse(results[0].models));
          } catch(e) {
            // this is fine, just means it has no data yet
            resolve({error: e.message}); 
          }
          
        } else {
          reject(new Error("Nothing found"));
        }
      })
    }).finally(() => db.end());
  }
  static async setCurrentModels(apiKey:string, newModel:any):Promise<any> {

    // let's make sure that every key in newModel represents a model that actually exists
    for(var key in newModel) {
      const regexOnlyLetters = /[\D]/gi;
      key = key.replace(regexOnlyLetters, '');
      const required = require(`../webapp/src/Configs/${key}`);
      // if we didn't throw, we're good!
    }

    const db = await getDb();

    return new Promise((resolve, reject) => {
      db.execute(`update sources set model=? where apikey=?`, [JSON.stringify(newModel), apiKey], (err, results:any[]) => {
        if(err) {
          reject(err);
        } else if(results.length === 1) {
          try {
            resolve(JSON.parse(results[0].model));
          } catch(e) {
            // this is fine, just means it has no data yet
            resolve({}); 
          }
          
        } else {
          reject(new Error("Nothing found"));
        }
      })
    })

  }
  static getNextSource(startFromId:number):Promise<SourceInfo> {
    // let's find every source with a fresh (recent in 1 day) video
    if(typeof startFromId !== 'number') {
      throw new Error("StartfromId needs to be a number...");

    }
    return getDb().then((db) => {
      return new Promise<SourceInfo>((resolve, reject) => {

        const msInDay = 24*3600*1000;
        const tmStart = new Date().getTime() - 0.5*msInDay; // only show "next sources" that have updated in the last 12 hours
        db.execute(`select sources.id from videos,sources where videos.removed=0 and videos.sourceid=sources.id and videos.tmEnd > ? group by sources.id order by sources.handle`, [tmStart/1000], (err, results:any[]) => {
          if(err) {
            reject(err);
          } else if(results.length > 0) {
            
            let ixMe = results.findIndex((res) => res.id === startFromId);
            let ixNext = ixMe;
            if(ixMe < 0) {
              // hmm, the one they requested apparently doesn't even have a recent video.
              ixMe = Math.floor((Math.random() * results.length) % results.length);
            }
            ixNext = (ixMe + 1) % results.length;

            const idNext = results[ixNext].id;
            return this.getSourceInfo(idNext).then(resolve, reject);
          } else {
            reject(new Error("No videos found"));
          }
        })
      }).finally(() => db.end());
    })

  }

  static getMostPopularSource():Promise<SourceInfo> {
    return getDb().then((db) => {
      return new Promise<SourceInfo>((resolve, reject) => {

        db.execute(`select count(reactions.id) as reactionCount, sources.name, sources.description, sources.id, sources.handle as handle from videos,sources,reactions where reactions.videoid=videos.id and videos.sourceid=sources.id group by sources.id order by reactionCount desc limit 1;`, [], (err, result:any[]) => {
          if(err) {
            reject(err);
          } else if(result.length === 1) {
            resolve(result[0] as SourceInfo);
          } else {
            reject(new Error("No videos found"));
          }
        })
      }).finally(() => db.end());
    })
  }

  private static processRawVideoResult(raw:any) {
    
    let filename:string = raw.filename;

    if(filename) {
      const ixLastSlash = filename.lastIndexOf('/');
      filename = filename.slice(ixLastSlash+1);
      return({
        filename,
        id: raw.id,
        sourceId: raw.sourceid,
        handle: raw.handle,
      } as VideoInfo);
    }
  }
  static async getMostRecentVideoOfSourceByHandle(handle:string):Promise<VideoInfo> {

    return getDb().then((db) => {
      return new Promise<VideoInfo>((resolve, reject) => {

        let q;
        let args = [];
        q = `select filename,sourceid,videos.id,sources.handle as handle from videos,sources where videos.sourceid=sources.id and sources.handle=? order by id desc limit 1`;
        args = [handle];

        db.execute(q, args, (err, result:any[]) => {
          if(err) {
            reject(err);
          } else if(result.length === 1) {
            resolve(this.processRawVideoResult(result[0]));
          } else {
            reject(new Error("No videos found"));
          }
        })
      }).finally(() => db.end());
    })
  }
  static async getMostRecentVideoOfSource(sourceId:number):Promise<VideoInfo> {

    return getDb().then((db) => {
      return new Promise<VideoInfo>((resolve, reject) => {

        let q;
        let args = [];
        q = `select filename,sourceid,videos.id,sources.handle as handle from videos,sources where videos.sourceid=? order by id desc limit 1`;
        args = [sourceId];

        db.execute(q, args, (err, result:any[]) => {
          if(err) {
            reject(err);
          } else if(result.length === 1) {
            resolve(this.processRawVideoResult(result[0]));
          } else {
            reject(new Error("No videos found"));
          }
        })
      }).finally(() => db.end());
    })
  }
  static async getVideo(id:number|null):Promise<VideoInfo> {
    if(id === null) {
      // didn't specify a video?  then you're getting one from a popular source
      const sourceId = await this.getMostPopularSource();
      id = (await this.getMostRecentVideoOfSource(sourceId.id)).id;
    }
    return getDb().then((db) => {
      return new Promise<VideoInfo>((resolve, reject) => {

        let q;
        let args = [];
        q = `select filename,sourceid,videos.id,sources.handle as handle from videos,sources where videos.sourceid=sources.id and videos.id=?`;
        args = [id];

        db.execute(q, args, (err, result:any[]) => {
          if(err) {
            reject(err);
          } else if(result.length === 1) {
            resolve(this.processRawVideoResult(result[0]));
          } else {
            reject(new Error("No videos found"));
          }
        })
      }).finally(() => db.end());
    })
  }

  static async markVideoRemoved(id:number):Promise<any> {
    if(platform() === 'win32') {
      // when art's debugging, don't wipe out videos...
      return Promise.resolve();
    }
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

  static async getReactionCountsForVideo(videoId:number):Promise<{[key:string]:number}> {
    // ok, this one is a bit complicated.
    // if we get reactions for a video, that'll be fairly shitty.
    // because a video is only the "lead" video for like 15 seconds.
    // so what we want to do is try to get the cumulative reaction counts for every video that shares images with the targeted video.
    // so first we want to get all the imageids that are included in this video:
    //   SQL: select images_in_videos.id,videos.* from images_in_videos,reactions, videos where videos.removed=0 and reactions.videoid=videos.id and videos.id=7719 and images_in_videos.videoid=videos.id
    // then we want to find all the videoids that share some of those images:
    //   SQL: (select videos.id from videos,images_in_videos where images_in_videos.videoid=videos.id and images_in_videos.imageid in (select images_in_videos.imageid from images_in_videos,reactions, videos where videos.removed=0 and reactions.videoid=videos.id and videos.id=7719 and images_in_videos.videoid=videos.id) group by videos.id)
    // then we want to find all the reactions applied to any of those videoids:
    //   SQL: (select count(id) as total, reactions.reactionid from reactions where reactions.videoid in (select videos.id from videos,images_in_videos where images_in_videos.videoid=videos.id and images_in_videos.imageid in (select images_in_videos.imageid from images_in_videos,reactions, videos where videos.removed=0 and reactions.videoid=videos.id and videos.id=7719 and images_in_videos.videoid=videos.id) group by videos.id) group by reactions.reactionid)

    return getDb().then((db) => {
      return new Promise<{[key:number]:number}>((resolve, reject) => {
        db.execute(`SELECT 
                          COUNT(id) as total, reactions.reactionid
                      FROM
                          reactions
                      WHERE
                          reactions.videoid IN (SELECT 
                                  videos.id
                              FROM
                                  videos,
                                  images_in_videos
                              WHERE
                                  images_in_videos.videoid = videos.id
                                      AND images_in_videos.imageid IN (SELECT 
                                          images_in_videos.imageid
                                      FROM
                                          images_in_videos,
                                          reactions,
                                          videos
                                      WHERE
                                          videos.removed = 0
                                              AND videos.id = ?
                                              AND images_in_videos.videoid = videos.id)
                              GROUP BY videos.id)
                      GROUP BY reactions.reactionid`, [videoId], (err, results:any[]) => {
          if(err) {
            console.log("failed to get reaction counts", err);
            reject(err);
          } else {
            let ret:{[key:string]:number} = {};
            results.forEach((result) => {
              ret[result.reactionid] = result.total
            });
            resolve(ret);
          }
        })
      }).finally(() => db.end());
    })

  }

  static async getReactionCounts():Promise<{[key:number]:number}> {
    return getDb().then((db) => {
      return new Promise<{[key:number]:number}>((resolve, reject) => {
        db.execute('select videoid, videos.filename, count(reactions.id) from reactions, videos where reactions.videoid = videos.id and videos.removed=0 and reactions.tm > unix_timestamp() - 3600*24*30 group by videos.id', [], (err, results:any[]) => {
          if(err) {
            console.log("failed to get reaction counts", err);
            reject(err);
          } else {
            let ret:{[key:number]:number} = {};
            results.forEach((result) => {
              ret[result.videoid] = (ret[result.videoid] || 0) + 1;
            });
            resolve(ret);
          }
        })
      }).finally(() => db.end());
    })

  }

  static async checkRemovedVideos():Promise<any> {
    const activeVideos = await this.getActiveVideoInfos();

    let updateIds = [];
    activeVideos.forEach((video) => {
      if(!fs.existsSync(getPathToVideo(video))) {
        console.log("video ", video.id, ": ", getPathToVideo(video), " doesn't exist.  We will remove it");
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