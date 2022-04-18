import { Canvas } from "canvas";
import {apply as processApply} from './Process/Code';
import SunCalc from 'suncalc'

export function testAssert(f:any, reason?:string) {
  if(!f) {
    debugger;
  }
}

export interface Rect {
  left:number;
  top:number;
  right:number;
  bottom:number;
}

export function getHistogramInRc(canvas:Canvas, rc:Rect):number[] {
  const ctx = canvas.getContext('2d');
  const data = ctx.getImageData(0,0,canvas.width, canvas.height);

  let ret:number[] = [];
  let alpha:number[] = [];
  for(var x = 0;x < 256; x++) {
    ret.push(0);
    alpha.push(0);
  }

  const pix = [1,1,1,0];
  console.log("getHistogramInRc for ", rc);

  const bytesPerRow = canvas.width * pix.length;

  let pixelsChecked = 0;

  const ixColLeft = rc.left;
  const ixColRight = rc.right;

  for(var ixRow = rc.top; ixRow < rc.bottom; ixRow++) {
    

    const byteStart = ixRow * bytesPerRow;

    for(var ixCol = ixColLeft; ixCol < ixColRight; ixCol++) {
      const ixPx = ixRow * bytesPerRow + ixCol*pix.length;
      pixelsChecked++;

      for(var ixChannel = 0; ixChannel < pix.length; ixChannel++) {
        const px = data.data[ixPx + ixChannel];
        if(pix[ixChannel]) {
          ret[px]++;
        } else {
          alpha[px]++;
        }
      }
    }
  }
  return ret;
}
export function getHistogram(canvas:Canvas):number[] {
  const ctx = canvas.getContext('2d');
  const data = ctx.getImageData(0,0,canvas.width, canvas.height);

  let ret:number[] = [];
  let alpha:number[] = [];
  for(var x = 0;x < 256; x++) {
    ret.push(0);
    alpha.push(0);
  }

  const pix = [1,1,1,0];
  console.log("pixel format of " + canvas.width + " x " + canvas.height+ " canvas is ", (ctx as any).pixelFormat);

  const bytesPerRow = canvas.width * pix.length;

  let pixelsChecked = 0;

  const stepSize = 6;

  for(var ixRow = 0; ixRow < canvas.height / 2; ixRow+=stepSize) {
    const ixStart = ixRow * bytesPerRow;
    const pctRow = ixRow / canvas.height;
    
    const pctLeft = 0.5 - Math.sqrt(1 - Math.pow(2*pctRow - 1, 2))/2;
    const pctRight = 0.5 + Math.sqrt(1 - Math.pow(2*pctRow - 1, 2))/2;
    const ixColLeft = Math.floor(pctLeft * canvas.width);
    const ixColRight = Math.ceil(pctRight * canvas.width);

    const byteStart = ixRow * bytesPerRow;
    const rowData = data.data.slice(byteStart, byteStart + bytesPerRow);

    for(var ixCol = ixColLeft; ixCol < ixColRight; ixCol+=stepSize) {
      const ixPx = ixRow * bytesPerRow + ixCol*pix.length;
      pixelsChecked++;

      for(var ixChannel = 0; ixChannel < pix.length; ixChannel++) {
        const px = data.data[ixPx + ixChannel];
        if(pix[ixChannel]) {
          ret[px]++;
        } else {
          alpha[px]++;
        }
      }
    }
  }
  testAssert(alpha[255] === pixelsChecked);

  ret = ret.map((val) => val * stepSize * stepSize);

  return ret;
}

export function getMeanBrightness(canvas:Canvas, fnHisto:(canvas:Canvas)=>number[]):{histo:number[], mean:number, pixelCount:number, histoPct:number[]} {
  
  const histo = fnHisto(canvas);
  
  let sum = 0;
  let count = 0;
  for(var val = 0; val < histo.length; val++) {
    sum += val * histo[val];
    count += histo[val];
  }
  const mean = sum / count;
  return {
    histo, 
    mean,
    pixelCount: count,
    histoPct: histo.map((bucket) => bucket / count),
  };
}

export function analyzeHistogram(nthPercentileLow:number, nthPercentileHigh:number, nHisto:number, comboHisto:number[]):{low:number, mean:number, high:number} {

  // let's ignore the blown-out values: they're already blown out, there's nothing we can do to save them
  let N = comboHisto.length;
  let totalPixels = 0;

  let sum = 0;
  let count = 0;
  comboHisto.forEach((pixelCount, value) => {
    sum += pixelCount * value;
    count += pixelCount;

    totalPixels += pixelCount
  });

  let targets = [
    (nthPercentileLow / 100)*totalPixels,
    totalPixels / 2,
    (nthPercentileHigh / 100)*totalPixels,
    Number.MAX_SAFE_INTEGER,
  ];

  let results:number[] = [0,0,0];
  let currentPixelSum = 0;
  let maxHistoBucketWithValue = 0;

  let ixCurrentTarget = 0;

  for(var value = 0; value < comboHisto.length; value++) {
    const thisAddition = comboHisto[value];
    
    if(thisAddition > 0) {
      maxHistoBucketWithValue = value;
    }

    currentPixelSum += thisAddition;

    while(thisAddition > 0 && currentPixelSum >= targets[ixCurrentTarget] && ixCurrentTarget < targets.length) {
      // we just switched over
      results[ixCurrentTarget] = value;
      ixCurrentTarget++;
    }
  }


  return {low:results[0], mean:sum / count, high:results[2] || maxHistoBucketWithValue};
}


export function dassert(f:any, reason?:string) {
  if(!f) {
    console.error(reason, new Error().stack);
    debugger;
  }
}

let msStart = 0;
export function elapsed():number {
  const tmNow = new Date().getTime();
  if(msStart === 0) {
    msStart = tmNow;
  }
  return (tmNow - msStart);
}

function makeCanvas<T>(w:number,h:number):T {
  if(typeof document !== 'undefined' && document.createElement) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c as any;
  } else {
    return new Canvas(w,h) as any;
  }
}

export class ImageEffects {
  static async prepareCanvasFromBuffer<T>(inBuffer:Buffer, fnMakeImage:()=>any):Promise<T> {

    const image = await new Promise<any>((resolve, reject) => {
      const image = fnMakeImage();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = `data:image/jpeg;base64,${inBuffer.toString('base64')}`;
    })

    const canvas = makeCanvas<T>(image.width, image.height) as any;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(image, 0, 0);

    return canvas;
  }
  static async process(canvas:Canvas, currentModels:any):Promise<Canvas> {

    

    // ok, we've got our image!  let's run it through the pipeline!
    const pipeline = [
      processApply,
    ]

    pipeline.forEach((pipe, index) => {
      pipe(canvas, currentModels);
    })

    return canvas;
  }


}