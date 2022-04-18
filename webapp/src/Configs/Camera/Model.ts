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
    this.fix60hz = false;
  }

  desiredW:number;
  desiredH:number;
  desiredPhotoPeriodMs:number;
  minSunAngle:number;
  extraParams:string;
  targetedMeanBrightness:number;
  rcExposure: Rect| null;
  fix60hz:boolean;
}