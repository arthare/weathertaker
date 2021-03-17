import { execSync } from 'child_process';
import fs from 'fs';

export async function runWatchdog() {
  // we need to check how old the last ./tmp/from-camera.jpg is.  If it's older than two minutes, time to reboot!
  // why?  raspistill seems to have a nasty probability of locking up about once a day.  If the actual camera process locks up, 
  // this simple process can reboot the pi and we'll only miss a couple minutes of photos.
  const stats = fs.lstatSync('./tmp/from-camera.jpg');
  const tmMod = stats.mtimeMs;
  const tmNow = new Date().getTime();

  console.log(`Watchdog: from-camera.jpg was modified ${((tmNow - tmMod)/1000).toFixed(1)}s ago`);
  const msTimeLast = tmNow - tmMod;
  if(msTimeLast > 90000) {
    console.log("it's been too long, we should reboot!");
    execSync('sudo reboot');
  } else {
    setTimeout(runWatchdog, 30000);
  }
}