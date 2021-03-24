import { Canvas } from "canvas";
import { CameraPlugin } from "./Plugin";
import {IMAGE_SUBMISSION_HEIGHT, IMAGE_SUBMISSION_WIDTH} from '../webapp/src/Configs/Types';
import { CameraModel } from "../webapp/src/Configs/Camera/Model";
import { exec, spawnSync } from "child_process";
import {readFromCamera} from './PluginUtils';


export class FsWebcamPlugin implements CameraPlugin {
  takePhoto(cameraModel:CameraModel): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      console.log("fswebcam going to run with cameramodel ", cameraModel);
      const desiredAspect = IMAGE_SUBMISSION_WIDTH / IMAGE_SUBMISSION_HEIGHT;
      const w = Math.floor(IMAGE_SUBMISSION_HEIGHT * desiredAspect);
      const command = `fswebcam --jpeg 95 -S 50 -F 1 -r ${cameraModel.desiredW}x${cameraModel.desiredH} --scale ${w}x${IMAGE_SUBMISSION_HEIGHT} ./tmp/from-camera.jpg`;
      console.log("Running fswebcam: ", command);
      exec(command, (err, stdout, stderr) => {
        if(err) {
          console.error("Error doing fswebcam: ", err);
          reject(err);
        } else {
          readFromCamera("./tmp/from-camera.jpg", resolve, reject);
        }
      })
    })
  }
  analyzeRawImage(image: Canvas): Promise<void> {
    // fswebcam doesn't look back.
    return Promise.resolve();
  }

  static available() {
    const ret = spawnSync('fswebcam', ['--version']);
    return !ret.error;
  }

}
