import { exec } from 'child_process';
import { UV_FS_O_FILEMAP } from 'constants';
import fs from 'fs';
import { platform } from 'os';
import { cwd } from 'process';
import { v4 as uuidv4 } from 'uuid';
import Db, { InsertVideo, SourceInfo } from './Db';
import { guaranteePath } from './FsUtils';
const ffmpeg = require("ffmpeg-cli");
ffmpeg.run("-version");
console.log(ffmpeg.runSync("-version"));

let working = false;

function makeVideo(imageIds:number[]) {
  working = true;
  working = false;
}

let stale = {}; // mapping from source handles to whether they are stale or not

export function markSourceStale(sourceId:number) {
  stale[sourceId] = true;
}

async function generateVideoFor(sourceId:number):Promise<any> {
  
  let sourceInfo:SourceInfo = await Db.getSourceInfo(sourceId);

  let images = await Db.getRecentImages(new Date().getTime(), 4*3600, sourceId);
  images = images.filter((image) => fs.existsSync(image.filename));
  

  const imageList = images.map((image) => {

    let filename = image.filename;

    if(platform() === 'win32') {
      filename = filename.replace(/\\/gi, '/');
      filename = filename.replace(/([A-Z]):(.*)/i, function(all, driveLetter, rest) {
        return `/${driveLetter.toLowerCase()}${rest}`
      });
    }
    

    return filename
  });

  const createdVideo = await new Promise<InsertVideo>((resolve, reject) => {
    const outFileName = uuidv4();
    const videoPath = `${cwd()}/videos/${sourceInfo.handle}/${outFileName}.mp4`;
    guaranteePath(videoPath);
    let finalCommand = `cat ${imageList.join(' ')} | ffmpeg -f image2pipe -i - -c:v libx264 -pix_fmt yuv420p ${videoPath}`;
    
    if(platform() === 'win32') {
      finalCommand = finalCommand.replace(/\\/gi, '/');
    }

    console.log("command\n\n", finalCommand);
    exec(finalCommand, (err, stdout, stderr) => {
      if(err) {
        debugger;
        reject(err);
      } else {
        // this is fine - if it didn't return a total-failure error code, then it actually generated!
        resolve({
          sourceId,
          filename: videoPath,
          imageIds: images.map((img) => img.id),
        });
      }
    });
  });

  Db.insertVideo(createdVideo);
}

async function checkForWork() {

  if(!working) {
    // time to find a stale thing to do!
    let staleSourceIds = [];
    for(var key in stale) {
      if(stale[key]) {
        staleSourceIds.push(parseInt(key));
      }
    }

    if(staleSourceIds.length > 0) {
      const ixToWork = Math.floor(Math.random() * staleSourceIds.length);
      const sourceId = staleSourceIds[ixToWork];
      try {
        console.log("going to work on sourceId ", sourceId);
        working = true; // we're going to work!
        await generateVideoFor(sourceId);
      } catch(e) {
        console.log("Error: ", e);
      } finally {
        working = false;
        stale[sourceId] = false;
        console.log("done working on sourceId", sourceId);
      }
    }
    
  }

  setTimeout(() => {
    checkForWork();
  }, 1000);
}

export function notifyDirtySource(sourceId:number) {
  stale[sourceId] = true;
}

export function initVideoMaker() {
  stale = {
    '2': true,
  };

  checkForWork();
}