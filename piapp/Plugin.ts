import { Canvas } from "canvas";
import { CameraModel } from "../webapp/src/Configs/Camera/Model";

export interface CameraPlugin {
  takePhoto(cameraModel:CameraModel):Promise<Buffer>;
  analyzeRawImage(cameraModel:CameraModel, image:Canvas):Promise<void>;
}