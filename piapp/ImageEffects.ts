import {Image as ImageJs} from 'image-js';
import {Canvas, Image} from 'canvas';
import {apply as processApply} from '../webapp/src/Configs/Process/Code';
import { elapsed } from '../webapp/src/Configs/Utils';


export class ImageEffects {
  static async prepareCanvasFromBuffer(inBuffer:Buffer):Promise<Canvas> {

    const image = await new Promise<any>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = `data:image/jpeg;base64,${inBuffer.toString('base64')}`;
    })

    const canvas = new Canvas(image.width, image.height);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(image, 0, 0);

    return canvas;
  }
  static async process(canvas:Canvas, currentModels:any):Promise<Canvas> {

    
    if(!currentModels['CurrentTime']) {
      currentModels['CurrentTime'] = {
        tm: new Date().getTime(),
      }
    }

    console.log("model for image: ", currentModels);
    // ok, we've got our image!  let's run it through the pipeline!
    const pipeline = [
      processApply,
    ]

    pipeline.forEach((pipe, index) => {
      console.log(elapsed(), "Applying pipeline ", index, " / ", pipeline.length);
      pipe(canvas, currentModels);
    })

    return canvas;
  }


}