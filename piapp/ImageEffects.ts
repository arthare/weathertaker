import {Image as ImageJs} from 'image-js';
import { dassert, elapsed } from './Utils';
import {Canvas, Image} from 'canvas';


export class ImageEffects {
  static async process(_image:ImageJs, inBuffer:Buffer):Promise<Buffer> {
    
    const peakHistoBrightness = 256;
    const basicStats = ImageEffects.getMeanBrightness(peakHistoBrightness, _image);

    const histoResult = ImageEffects.analyzeHistogram(2.5, 99.5, peakHistoBrightness, basicStats.histo);
    console.log(elapsed(), "histoResult = ", histoResult);


    const image = await new Promise<any>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = `data:image/jpeg;base64,${inBuffer.toString('base64')}`;
    })

    const canvas = new Canvas(image.width, image.height);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(image, 0, 0);
    

    const data = ctx.getImageData(0,0,canvas.width, canvas.height);
    const pixels = data.data;

    console.log(elapsed(), "about to level");
    const span = histoResult.high - histoResult.low;
    pixels.forEach((byt, index) => {
      pixels[index] = Math.floor(256 * (byt - histoResult.low) / (span));
    })
    ctx.putImageData(data, 0, 0);
    console.log(elapsed(), "leveled");

    return canvas.toBuffer();
  }

  public static getMeanBrightness(peakHistoBrightness:number, image:ImageJs):{histo:number[][], mean:number} {
    
    const histo = (image as any).getHistograms({maxSlots: peakHistoBrightness, useAlpha: false});
    let sum = 0;
    let count = 0;
    for(var color = 0; color < histo.length; color++) {
      for(var val = 0; val < histo[color].length; val++) {
        sum += val * histo[color][val];
        count += histo[color][val];
      }
    }
    const mean = sum / count;
    return {histo, mean};
  }

  public static analyzeHistogram(nthPercentileLow:number, nthPercentileHigh:number, nHisto:number, histos:number[][]):{low:number, mean:number, high:number} {
    let comboHisto = [];
    for(var x = 0;x < nHisto; x++) {comboHisto.push(0);}

    let N = histos[0].length;

    for(var channel = 0; channel < histos.length; channel++) {
      for(var value = 0; value < histos[channel].length; value++) {
        comboHisto[value] += histos[channel][value];
      }
    }

    // let's ignore the blown-out values: they're already blown out, there's nothing we can do to save them
    comboHisto = comboHisto.slice(1, N-1);
    N -= 2;
    let total = 0;
    comboHisto.forEach((val) => total += val);

    let targets = [
      (nthPercentileLow / 100)*total,
      total / 2,
      (nthPercentileHigh / 100)*total,
    ];

    let results = [];
    let currentSum = 0;
    for(var value = 0; value < comboHisto.length; value++) {
      const thisAddition = comboHisto[value];
      
      targets.forEach((target, index) => {
        if(target >= currentSum && target < (currentSum + thisAddition)) {
          results[index] = value;
        }
      })
      currentSum += thisAddition;
    }
    
    dassert(currentSum === total);

    return {low:results[0], mean:results[1], high:results[2]};
  }

}