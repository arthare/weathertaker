import { Canvas } from "canvas";
import { exec, spawnSync } from "child_process";
import { isBuffer } from "util";
import { CameraModel } from "../webapp/src/Configs/Camera/Model";
import { IMAGE_SUBMISSION_HEIGHT, IMAGE_SUBMISSION_WIDTH } from "../webapp/src/Configs/Types";
import { elapsed } from "../webapp/src/Configs/Utils";
import { CameraPlugin } from "./Plugin";
import { GPhotoIsoChoice, GPhotoShutterSpeedChoice, GPhotoSpeeds, parseGPhoto2Isos, parseGPhoto2Speeds } from "./PluginGPhotoUtils";
import { ExposureAdjustingCamera, readFromCamera } from "./PluginUtils";

export class GPhotoPlugin extends ExposureAdjustingCamera implements CameraPlugin {
  
  private _desiredSsSeconds:number;
  private _desiredIso:number;

  private _speeds:GPhotoSpeeds;
  private _isos:GPhotoIsoChoice[];
  constructor() {
    super();
    // we need to make sure we've got a camera and figure out min/max shutterspeeds on it
    const rawSs = spawnSync('gphoto2', ['--get-config=shutterspeed']);
    this._speeds = parseGPhoto2Speeds(rawSs.stdout.toString());
    
    const rawIso = spawnSync('gphoto2', ['--get-config=iso']);
    this._isos = parseGPhoto2Isos(rawIso.stdout.toString());

    console.log("Gphoto2 plugin configured with speeds ", this._speeds, " and isos ", this._isos);

    this.initExposureControl(1000*1000, this._speeds.choices[this._speeds.choices.length-1].seconds*1000000, this._speeds.choices[0].seconds*1000000, this._isos[0].iso, this._isos[this._isos.length-1].iso);

  }
  takePhotoExposureControlled(targetUs:number, targetIso:number, cameraModel: CameraModel): Promise<Buffer> {
    console.log("takephoto exposure controlled ")
    const setting = this.getActualShutterSettingsFor(targetUs, targetIso).internal;

    const settingIso:GPhotoIsoChoice = setting.iso;
    const settingSs:GPhotoShutterSpeedChoice = setting.ss;


    const cameraCommand = `gphoto2 --set-config shutterspeed=${settingSs.ix} --set-config iso=${settingIso.ix} --no-keep --capture-image-and-download --filename=./tmp/from-camera.jpg --force-overwrite`;
    console.log("GPhoto plugin using ss", settingSs, " and iso ", settingIso);
    console.log(cameraCommand);
    return new Promise<Buffer>((resolve, reject) => {
      exec(cameraCommand, (err, stdout, stderr) => {
        console.log("camera command result ", err, stdout, stderr);
        if(err) {
          reject(err);
        } else {
          // oh boy!  it worked!
          console.log("gphoto command worked: ", stdout);

          const desiredAspect = IMAGE_SUBMISSION_WIDTH / IMAGE_SUBMISSION_HEIGHT;
          const w = Math.floor(IMAGE_SUBMISSION_HEIGHT * desiredAspect);
          
          
          const resizeCommand = `convert ./tmp/from-camera.jpg -resize ${w}x${IMAGE_SUBMISSION_HEIGHT} -quality 99% ./tmp/resized.jpg`;
          console.log("attempting to resize with imagemagick");
          console.log(resizeCommand);
          exec(resizeCommand, (err, stdout, stderr) => {
            console.log("resize result from imagemagick ", err, stdout, stderr);
            if(err) {
              reject(err);
            } else {
              console.log(elapsed(), "imagemagick resize complete");
              readFromCamera("./tmp/resized.jpg", resolve, reject);
            }
          });
        }
      });
    })
  }

  protected getActualShutterSettingsFor(us: number, iso: number): {us: number; iso: number; internal: any;} {
    const targetIso100Equiv = us * iso / 100;
    console.log("trying to find settings for us/iso ", us, iso);
    let isoSetting = this._isos.find((myIso) => myIso.iso === iso) || this._isos[0];


    // let's go through all our iso/ss combinations and find the one that's the closest
    let bestDelta = Number.MAX_SAFE_INTEGER;
    let ixBest = -1;
    this._speeds.choices.forEach((speed, ixSpeed) => {
      const thisUs = speed.seconds * 1000000;
      const thisIso100Equiv = thisUs * iso / 100;
      const delta = Math.abs(thisIso100Equiv - targetIso100Equiv);
      if(delta < bestDelta) {
        bestDelta = delta;
        ixBest = ixSpeed;
      }
    })

    const ret = {
      us: this._speeds.choices[ixBest].seconds * 1000000,
      iso: iso,
      internal: {
        ss: this._speeds.choices[ixBest],
        iso: isoSetting,
      },
    }
    console.log("Settings for us/iso ", us, iso, " = ", ret);
    return ret;
  }

  static available():boolean {
    const autoDetect = spawnSync(`gphoto2`, ['--auto-detect']);
    if(autoDetect.error) {
      return false;
    }
    // this will give output like:
    //    Model                          Port
    //    ----------------------------------------------------------
    //    USB PTP Class Camera           usb:001,006
    console.log("result from gphoto2 --version ", autoDetect.stdout);
    const lines = autoDetect.stdout.toString().split('\n');
    console.log("GPhoto2 results:\n" + lines.map((l) => "    " + l).join('\n'));
    if(lines.length >= 3 && lines[2].includes('usb:')) {
      return true;
    }
    return false;
  }
}