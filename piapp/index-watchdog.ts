import { execSync } from 'child_process';
import fs from 'fs';

export async function runWatchdog() {
  // we need to check how old the last ./tmp/from-camera.jpg is.  If it's older than two minutes, time to reboot!
  // why?  raspistill seems to have a nasty probability of locking up about once a day.  If the actual camera process locks up, 
  // this simple process can reboot the pi and we'll only miss a couple minutes of photos.
  const stats = fs.lstatSync('./tmp/from-camera.jpg');
  const statSignal = fs.lstatSync('./tmp/startup.txt');
  const tmStarted = statSignal.mtimeMs;
  const tmMod = stats.mtimeMs;
  const tmNow = new Date().getTime();

  const msSinceLast = tmNow - tmMod;
  const msSinceStartup = tmNow - tmStarted;

  console.log(`Watchdog: from-camera.jpg was modified ${((msSinceLast)/1000).toFixed(1)}s ago`);
  console.log(`Watchdog: startedup.txt was modified ${((msSinceStartup)/1000).toFixed(1)}s ago`);
  if(msSinceLast > 90000 && msSinceStartup > 120000) {
    console.log("it's been too long, we should reboot!");
    execSync('sudo reboot');
  } else {
    setTimeout(runWatchdog, 30000);
  }
}