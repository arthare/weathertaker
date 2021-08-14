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

  for(var ixRow = rc.top; ixRow < rc.bottom / 2; ixRow++) {
    

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
  testAssert(alpha[255] === pixelsChecked);
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

  for(var ixRow = 0; ixRow < canvas.height / 2; ixRow++) {
    const ixStart = ixRow * bytesPerRow;
    const pctRow = ixRow / canvas.height;
    
    const pctLeft = 0.5 - Math.sqrt(1 - Math.pow(2*pctRow - 1, 2))/2;
    const pctRight = 0.5 + Math.sqrt(1 - Math.pow(2*pctRow - 1, 2))/2;
    const ixColLeft = Math.floor(pctLeft * canvas.width);
    const ixColRight = Math.ceil(pctRight * canvas.width);

    const byteStart = ixRow * bytesPerRow;
    const rowData = data.data.slice(byteStart, byteStart + bytesPerRow);

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
  testAssert(alpha[255] === pixelsChecked);
  return ret;
}

export function getMeanBrightness(canvas:Canvas):{histo:number[], mean:number} {
  
  const histo = getHistogram(canvas);
  
  let sum = 0;
  let count = 0;
  for(var val = 0; val < histo.length; val++) {
    sum += val * histo[val];
    count += histo[val];
  }
  const mean = sum / count;
  return {histo, mean};
}

export function analyzeHistogram(nthPercentileLow:number, nthPercentileHigh:number, nHisto:number, comboHisto:number[]):{low:number, mean:number, high:number} {

  // let's ignore the blown-out values: they're already blown out, there's nothing we can do to save them
  let N = comboHisto.length;
  let total = 0;
  comboHisto.forEach((val) => total += val);

  let targets = [
    (nthPercentileLow / 100)*total,
    total / 2,
    (nthPercentileHigh / 100)*total,
  ];

  let results:number[] = [];
  let currentSum = 0;
  let maxHistoBucketWithValue = 0;
  for(var value = 0; value < comboHisto.length; value++) {
    const thisAddition = comboHisto[value];
    
    if(thisAddition > 0) {
      maxHistoBucketWithValue = value;
    }
    targets.forEach((target, index) => {
      const thisSum = currentSum;
      const nextSum = currentSum + thisAddition;
      if(target >= thisSum && target < nextSum) {
        const pctTowardsNext = (target - thisSum) / (nextSum - thisSum);
        dassert(pctTowardsNext >= 0 && pctTowardsNext <= 1.0)
        results[index] = value + pctTowardsNext;
      }
    })
    currentSum += thisAddition;
  }

  return {low:results[0], mean:results[1], high:results[2] || maxHistoBucketWithValue};
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

function makeCanvas(w:number,h:number):Canvas {
  if(typeof document !== 'undefined' && document.createElement) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c as any;
  } else {
    return new Canvas(w,h);
  }
}

export class ImageEffects {
  static async prepareCanvasFromBuffer(inBuffer:Buffer, fnMakeImage:()=>any):Promise<Canvas> {

    const image = await new Promise<any>((resolve, reject) => {
      const image = fnMakeImage();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = `data:image/jpeg;base64,${inBuffer.toString('base64')}`;
    })

    const canvas = makeCanvas(image.width, image.height);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(image, 0, 0);

    return canvas;
  }
  static async process(canvas:Canvas, currentModels:any):Promise<Canvas> {

    
    if(!currentModels['CurrentTime']) {
      debugger;

      const tm = new Date().getTime();

      let pctDay = 1.0;
      if(currentModels['LatLng']) {
        const latLng = currentModels['LatLng'];
        const currentDate = new Date(tm);
        const pos = SunCalc.getPosition(currentDate, latLng.lat, latLng.lng);
        const angleDegrees = pos.altitude * 180 / Math.PI;
        const fullDay = 10;
        const fullNight = -10;
        pctDay = (angleDegrees - fullNight) / (fullDay - fullNight);
        pctDay = Math.max(0.0, pctDay);
        pctDay = Math.min(1.0, pctDay);
      }
      
      currentModels['CurrentTime'] = {
        tm: new Date().getTime(),
        pctDay,
      }
    }

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