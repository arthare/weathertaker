import { exec } from 'child_process';
import { UV_FS_O_FILEMAP } from 'constants';
import fs from 'fs';
import { platform } from 'os';
import { cwd } from 'process';
import { v4 as uuidv4 } from 'uuid';
import Db, { InsertVideo, SourceInfo, VideoInfo } from './Db';
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

async function cleanupOldVideos() {
  const activeVideos:VideoInfo[] = await Db.getActiveVideoInfos();
  const allHandles = fs.readdirSync(`${cwd()}/videos/`);

  let videoHandleLeaders:{[key:string]:VideoInfo} = {}
  let videoInfosByFilename:{[key:string]:VideoInfo} = {}
  let reactedToVideos:{[key:number]:number} = await Db.getReactionCounts();

  activeVideos.forEach((video) => {
    videoInfosByFilename[video.filename] = video;

    if(!videoHandleLeaders[video.handle]) {
      videoHandleLeaders[video.handle] = video;
      return;
    }
    const currentLeader = videoHandleLeaders[video.handle];
    if(video.id > currentLeader.id) {
      // this is a newer video for this handle
      videoHandleLeaders[video.handle] = video;
    }
  });

  // ok, so every video in videoHandleLeaders is safe.  Every other video is removable
  let removedFiles = [];
  const tmNow = new Date().getTime();

  allHandles.forEach((handle) => {
    const handlePath = `${cwd()}/videos/${handle}/`;
    if(fs.lstatSync(handlePath).isDirectory()) {
      const files = fs.readdirSync(handlePath);
      const myHandleLeader = videoHandleLeaders[handle];
      
      files.forEach((file) => {
        const myInfo = videoInfosByFilename[file];
        const fullPath = `${handlePath}${file}`;
        if(fs.lstatSync(fullPath).isFile()) {
          debugger;
          
          if(!myHandleLeader || !myInfo) {
            console.log("Removing ", file, " because I guess there isn't a leader at all for ", handle);
            removedFiles.push(fullPath);
          } else {
            const videoIsLeader = myHandleLeader.filename === file;
            const videoIsReactedTo = reactedToVideos[myInfo.id];
            const videoIsRecent = (tmNow - fs.statSync(fullPath).mtimeMs) < 60000*60;
            if(videoIsLeader ||
               videoIsRecent ||
               videoIsReactedTo) {
              console.log(`Video ${file} gets to live because it is leader ${!!videoIsLeader}, recent ${!!videoIsRecent}, or reactedto ${videoIsReactedTo}`);
            } else {
              console.log(`queuing ${file} for deletion because it is not leader, recent, or reacted-to`);
              removedFiles.push(fullPath);
            }
          }
        }
      })
    }
  });

  // ok, time to actually remove all these files...
  removedFiles.forEach(async (file) => {
    console.log("unlinking ", file);
    fs.unlinkSync(file);
  });
  await Db.checkRemovedVideos();
}

async function generateVideoFor(sourceId:number):Promise<any> {
  
  let sourceInfo:SourceInfo = await Db.getSourceInfo(sourceId);

  let images = await Db.getRecentImages(new Date().getTime(), 4*3600, sourceId);
  console.log(`found ${images.length} images for source ${sourceInfo.handle} ${sourceInfo.id}`);
  images = images.filter((image) => fs.existsSync(image.filename));
  console.log("after existence check, we have " + images.length + " images for ", sourceInfo.handle);

  const imageList = images.map((image) => {

    let filename = image.filename;

    if(platform() === 'win32') {
      filename = filename.replace(/\\/gi, '/');
      filename = filename.replace(/([A-Z]):(.*)/i, function(all, driveLetter, rest) {
        return `/${driveLetter.toLowerCase()}${rest}`
      });
    }
    

    return filename;
  });

  if(imageList.length > 0) {
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
            tmStart: Math.min(...images.map((image) => image.tmTaken)) / 1000,
            tmEnd: Math.max(...images.map((image) => image.tmTaken)) / 1000,
          });
        }
      });
    });
    await Db.insertVideo(createdVideo);

    await cleanupOldVideos();
  }

}

async function checkForWork() {

  console.log("Video maker checking for work.  Working? ", working, " stale source IDs: ", stale);
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
        console.log("Error making videos: ", e);
      } finally {
        working = false;
        stale[sourceId] = false;
        console.log("done working on sourceId", sourceId);
      }
    }
    
  }

  setTimeout(() => {
    checkForWork();
  }, 30000);
}

export function notifyDirtySource(sourceId:number) {
  console.log(`marked ${sourceId} as dirty`);
  stale[sourceId] = true;
}

export function initVideoMaker() {
  stale = {
    '2': true,
  };

  checkForWork();
  cleanupOldVideos();
}