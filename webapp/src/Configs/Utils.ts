import { Canvas } from "canvas";

export function getHistogram(canvas:Canvas):number[] {
  const ctx = canvas.getContext('2d');
  const data = ctx.getImageData(0,0,canvas.width, canvas.height);

  let ret:number[] = [];
  for(var x = 0;x < 256; x++) {
    ret.push(0);
  }
  data.data.forEach((px:number) => {
    ret[px]++;
  })
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
  comboHisto = comboHisto.slice(1, N-1);
  N -= 2;
  let total = 0;
  comboHisto.forEach((val) => total += val);

  let targets = [
    (nthPercentileLow / 100)*total,
    total / 2,
    (nthPercentileHigh / 100)*total,
  ];

  let results:number[] = [];
  let currentSum = 0;
  for(var value = 0; value < comboHisto.length; value++) {
    const thisAddition = comboHisto[value];
    
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
  
  return {low:results[0], mean:results[1], high:results[2]};
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