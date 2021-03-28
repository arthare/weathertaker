import { execSync } from 'child_process';
import { clear } from 'console';
import fs from 'fs';

export async function runWatchdog() {
  // we need to check how old the last ./tmp/from-camera.jpg is.  If it's older than two minutes, time to reboot!
  // why?  raspistill seems to have a nasty probability of locking up about once a day.  If the actual camera process locks up, 
  // this simple process can reboot the pi and we'll only miss a couple minutes of photos.

  let rebootTimeout;
  function resetTimeout() {
    clearTimeout(rebootTimeout);
    rebootTimeout = setTimeout(() => {
      execSync('sudo reboot');
    }, 5*60000);
  }

  fs.watchFile('./tmp/from-camera.jpg', {
    persistent: true,
    interval: 250,
  }, (curr:fs.Stats, prev:fs.Stats) => {
    console.log("the file changed!", curr, prev);
    resetTimeout();
  })
  console.log("set up watcher for ./tmp/from-camera.jpg");
}
