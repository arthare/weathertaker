import fetch from 'node-fetch';
import NodeWebcam from 'node-webcam';
import { platform } from 'os';
import fs from 'fs';
import {Raspistill} from 'node-raspistill';
import {RaspiStill} from './PluginRaspiStill';
import {Image as ImageJs} from 'image-js';
import { exec, execSync } from 'child_process';
import { ImageEffects } from '../webapp/src/Configs/Utils';
import { elapsed } from '../webapp/src/Configs/Utils';
import { LatLngModel } from '../webapp/src/Configs/LatLng/Model';
import {CameraModel} from '../webapp/src/Configs/Camera/Model';
import {ImageSubmissionRequest, IMAGE_SUBMISSION_HEIGHT, IMAGE_SUBMISSION_WIDTH, RecentRawFileSubmissionRequest} from '../webapp/src/Configs/Types';
import {runTestImages} from './index-testImages';
import {runWatchdog} from './index-watchdog';
import {prepareCameraPlugins} from './PluginFactory';
import { CameraPlugin } from './Plugin';
import {Image} from 'canvas';
import SunCalc from 'suncalc';
import {setupLocalApi} from './index-webserver';
import {takePictureLoop} from './index-pictureloop';






try {
  fs.mkdirSync('./tmp');
  fs.writeFileSync("./tmp/startup.txt", "started!");
} catch(e) {
  // oh well, the watchdog is going to murder us...
}




if(process.argv.find((arg) => arg === 'watchdog')) {
  runWatchdog();
} else if(process.argv.find((arg) => arg === "test-images")) {
  runTestImages();
} else {

  setupLocalApi();
  takePictureLoop();

}
