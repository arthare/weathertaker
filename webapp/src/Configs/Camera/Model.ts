import { Rect } from "../Utils";

export class CameraModel {

  constructor() {
    this.desiredW = 1280;
    this.desiredH = 720;
    this.desiredPhotoPeriodMs = 20000;
    this.minSunAngle = -90;
    this.extraParams = '';
    this.targetedMeanBrightness = 140;
    this.rcExposure = null;
  }

  desiredW:number;
  desiredH:number;
  desiredPhotoPeriodMs:number;
  minSunAngle:number;
  extraParams:string;
  targetedMeanBrightness:number;
  rcExposure: Rect| null;
}