import { CameraPlugin } from './Plugin';
import {RaspiStill} from './PluginRaspiStill';
import {FsWebcamPlugin} from './PluginFsWebcam';
import {GPhotoPlugin} from './PluginGPhoto';
import {LibCameraPlugin} from './PluginLibCamera'

export function prepareCameraPlugins():CameraPlugin[] {
  let ret = [];
  if(RaspiStill.available()) {
    ret.push(new RaspiStill())
  }

  if(GPhotoPlugin.available()) {
    ret.push(new GPhotoPlugin());
  }

  if(LibCameraPlugin.available()) {
    ret.push(new LibCameraPlugin());
  }

  return ret;
}