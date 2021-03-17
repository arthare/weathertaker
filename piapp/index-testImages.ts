import fs from 'fs';
import { LatLngModel } from '../webapp/src/Configs/LatLng/Model';
import { ImageEffects } from './ImageEffects';

export async function runTestImages() {

  const root = `./test-images`
  const imgs = fs.readdirSync(root);
  let lastPromise:Promise<any> = Promise.resolve();

  const modelToTest = {
    LatLng: {
      lat: 51.1985,
      lng: -114.487,
    } as LatLngModel,
    CurrentTime: {
      tm: new Date("2015-01-01T00:00:00-08:00"),
    }
  }

  for(var x = 0;x < imgs.length; x++) {
    await lastPromise;
    const img = imgs[x];
    if(img.includes( '.proc.jpg')) {
      continue;
    }

    const file = `${root}/${img}`;
    const buf = fs.readFileSync(file);
    const canvas = await ImageEffects.prepareCanvasFromBuffer(buf);

    let processed = await (lastPromise = ImageEffects.process(canvas, modelToTest));
    
    fs.writeFileSync(`${file}.proc.jpg`, processed.toBuffer());
  }

  await lastPromise;
}