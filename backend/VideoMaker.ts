import { exec, spawn } from 'child_process';
import { UV_FS_O_FILEMAP } from 'constants';
import fs from 'fs';
import { platform } from 'os';
import { cwd } from 'process';
import { v4 as uuidv4 } from 'uuid';
import Db, { InsertVideo, SourceInfo, VideoInfo } from './Db';
import { guaranteePath } from './FsUtils';

let working = false;

function makeVideo(imageIds:number[]) {
  working = true;
  working = false;
}

let g_staleCount:{[key:string]:number} = {}; // mapping from source handles to whether they are stale or not

export function markSourceStale(sourceId:number) {
  g_staleCount[sourceId] = Math.max(g_staleCount[sourceId] || 0, 1);
}

async function removeFileList(list:string[]):Promise<any> {

  let size = 0;
  function removeSingleFile(file:string):Promise<any> {
    
    // we need to clear this out of the db as well
    return new Promise<any>((resolve) => {
      size += fs.statSync(file).size;
      fs.unlink(file, resolve);
    })
  }

  // ok, time to actually remove all these files...
  const proms = list.map(async (file, index) => {
    return removeSingleFile(file);
  });
  return Promise.all(proms).finally(() => {
    console.log("removeFileList: removed " + ((size / (1024*1024))).toFixed(1) + "mb in " + list.length + " files");
  })
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
            } else {
              console.log(`queuing ${file} for deletion because it is not leader, recent, or reacted-to`);
              removedFiles.push(fullPath);
            }
          }
        }
      })
    }
  });
  
  await removeFileList(removedFiles);
  await Db.checkRemovedVideos();
}

async function cleanupOldImages():Promise<any> {
  const tmNow = new Date().getTime();
  const sources = await Db.getAllSources();

  let filesToDelete:string[] = [];
  let imageIdsToDelete:number[] = [];
  for(var x = 0;x < sources.length; x++) {
    const source = sources[x];
    const imagesToKeep = await Db.getRecentImages(tmNow, 0, source.id);
    const setKeep = new Set(imagesToKeep.map((i) => i.filename));

    // ok, we've got all the images that would be used in a fresh video.  We'll not delete those, but we can delete every single other one
    const imageDir = `${cwd()}/images/${source.handle}/`;
    try {
      const imagesOnDisk = fs.readdirSync(imageDir);
      imagesOnDisk.forEach((imgName) => {
        if(imgName.startsWith('raw-')) {
          // this is one of the raw samples.  we'll leave it
          return;
        }
        const imgPath = imageDir + imgName;
        
        if(!setKeep.has(imgPath)) {
          console.log("I should delete ", imgPath, " because it isn't in setKeep");
          filesToDelete.push(imgPath);
          imageIdsToDelete.push(imagesToKeep[0].id)
        }
      })
    } catch(e) {
      // whatever, I guess
      if(e.code === 'ENOENT') {
        // don't even bother logging this, it's fine
      } else {
        console.error(`Couldn't scan ${source.handle}'s image dir for images to delete`, e);
      }
    }
  }
  await removeFileList(filesToDelete);
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


      const imageListFormatted = imageList.map((img) => {
        return `file '${img}'`;
      })
      fs.writeFileSync('./video-paths.txt', imageListFormatted.join('\n'));

      let finalCommand = `ffmpeg -f concat -safe 0 -i ./video-paths.txt -c:v libx264 -pix_fmt yuv420p ${videoPath}`;
      
      if(platform() === 'win32') {
        finalCommand = finalCommand.replace(/\\/gi, '/');
      }
  
      console.log("command\n\n", finalCommand);
      const tmStart = new Date().getTime();
      const proc = exec(finalCommand, (err, stdout, stderr) => {
        const tmDone = new Date().getTime();
        const seconds = ((tmDone - tmStart) / 1000);
        const fps = imageList.length / seconds;
        console.log(`Took ${seconds.toFixed(1)}s to build ${imageList.length}-frame video ${fps.toFixed(2)}fps`);
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
      console.log("renicing!");
      var priority  = 10;
      var reniceProc = spawn("renice", [`${priority}`,  `-u`, `art`]);
      reniceProc.on('exit', function (code) {
        if (code !== 0){
            console.log("Process renice failed with code - " +code);
        }
      });
      reniceProc.stdout.on('data', function(data){
          console.log('renice stdout: ' + data);
      });
      reniceProc.stderr.on('data', function(data){
          console.log('renice stderr: '+ data);
      });
    });
    await Db.insertVideo(createdVideo);

    await cleanupOldVideos();
    await cleanupOldImages();
  }

}

async function checkForWork() {

  console.log("Video maker checking for work.  Working? ", working, " stale source IDs: ", g_staleCount);
  if(!working) {
    // time to find a stale thing to do!
    let staleSourceIds:number[] = [];
    for(var key in g_staleCount) {
      if(g_staleCount[key]) {
        // we'll do this like a lottery - you get (<passed-over count>)^1.5 tickets in the lottery to get your video made
        const ticketCount = Math.pow(g_staleCount[key], 1.5);
        for(var x = 0;x < ticketCount; x++) {
          staleSourceIds.push(parseInt(key));
        }
      }
    }

    if(staleSourceIds.length > 0) {
      const ixToWork = Math.floor(Math.random() * staleSourceIds.length);
      const sourceId = staleSourceIds[ixToWork];

      // update lottery ticket count
      for(var key in g_staleCount) {
        if(key !== ('' + sourceId) && g_staleCount[key] !== 0) {
          // this didn't get picked, so she gets another ticket next time round.
          g_staleCount[key]++;
          console.log("Video lottery: ", key, " will have " + g_staleCount[key] + " tickets next time");
        }
      }


      
      try {
        console.log("going to work on sourceId ", sourceId);
        working = true; // we're going to work!
        await generateVideoFor(sourceId);
      } catch(e) {
        console.log("Error making videos: ", e);
      } finally {
        working = false;
        g_staleCount[sourceId] = 0;
        console.log("done working on sourceId", sourceId);
      }
    }
    
  }

  setTimeout(() => {
    checkForWork();
  }, 30000);
}

export function notifyDirtySource(sourceId:number) {
  g_staleCount[sourceId] = Math.max(1, g_staleCount[sourceId] || 0);
}

export function initVideoMaker() {
  g_staleCount = {
    '2': 1,
  };

  checkForWork();
  cleanupOldVideos();
  cleanupOldImages();
}