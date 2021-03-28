import { CameraPlugin } from './Plugin';
import {RaspiStill} from './PluginRaspiStill';
import {FsWebcamPlugin} from './PluginFsWebcam';
import {GPhotoPlugin} from './PluginGPhoto';

export function prepareCameraPlugins():CameraPlugin[] {
  let ret = [];
  if(RaspiStill.available()) {
    ret.push(new RaspiStill())
  }

  if(FsWebcamPlugin.available()) {
    ret.push(new FsWebcamPlugin());
  }

  if(GPhotoPlugin.available()) {
    ret.push(new GPhotoPlugin());
  }

  return ret;
}