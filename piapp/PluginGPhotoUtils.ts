import {testAssert} from './Utils';

const sampleSpeeds = `Label: Shutter Speed
Readonly: 0
Type: RADIO
Current: 1/4000
Choice: 0 bulb
Choice: 1 30
Choice: 2 25
Choice: 3 20
Choice: 4 15
Choice: 5 13
Choice: 6 10
Choice: 7 8
Choice: 8 6
Choice: 9 5
Choice: 10 4
Choice: 11 3.2
Choice: 12 2.5
Choice: 13 2
Choice: 14 1.6
Choice: 15 1.3
Choice: 16 1
Choice: 17 0.8
Choice: 18 0.6
Choice: 19 0.5
Choice: 20 0.4
Choice: 21 0.3
Choice: 22 1/4
Choice: 23 1/5
Choice: 24 1/6
Choice: 25 1/8
Choice: 26 1/10
Choice: 27 1/13
Choice: 28 1/15
Choice: 29 1/20
Choice: 30 1/25
Choice: 31 1/30
Choice: 32 1/40
Choice: 33 1/50
Choice: 34 1/60
Choice: 35 1/80
Choice: 36 1/100
Choice: 37 1/125
Choice: 38 1/160
Choice: 39 1/200
Choice: 40 1/250
Choice: 41 1/320
Choice: 42 1/400
Choice: 43 1/500
Choice: 44 1/640
Choice: 45 1/800
Choice: 46 1/1000
Choice: 47 1/1250
Choice: 48 1/1600
Choice: 49 1/2000
Choice: 50 1/2500
Choice: 51 1/3200
Choice: 52 1/4000
END`;

const sampleIsos = `Label: ISO Speed
Readonly: 0
Type: RADIO
Current: 6400
Choice: 0 Auto
Choice: 1 100
Choice: 2 200
Choice: 3 400
Choice: 4 800
Choice: 5 1600
Choice: 6 3200
Choice: 7 6400
END`;

export interface GPhotoSpeeds {
  fastestSelection:number;
  slowestSelection:number;
  deltaForFaster:number;
  choices: GPhotoShutterSpeedChoice[];
}

export interface GPhotoShutterSpeedChoice {
  seconds:number;
  ix: number;
}
export interface GPhotoIsoChoice {
  iso:number;
  ix:number;
}

function choiceLinesToSplits(choiceLines:string[]):{ix:number, valueRaw:string}[] {
  let ret:{ix:number, valueRaw:string}[] = [];
  choiceLines.forEach((choice) => {
    const regexSplitter = /Choice: (\d+) (\d+[\/\.]?\d*)/;
    const splitted = regexSplitter.exec(choice);
    if(splitted && splitted.length === 3) {
      ret.push({ix: parseInt(splitted[1]), valueRaw: splitted[2]});
    }
  });
  return ret;
}

export function parseGPhoto2Speeds(raw:string) {
  const lines = raw.split('\n');
  
  const choiceLines = lines.filter((line) => line.startsWith('Choice:'));
  const choicesRaw = choiceLinesToSplits(choiceLines);
  let choices:GPhotoShutterSpeedChoice[] = choicesRaw.map((choice) => {
    let exposure:number;
    if(choice.valueRaw.includes('/')) {
      // fractions!
      const numdem = choice.valueRaw.split('/');
      exposure = parseFloat(numdem[0]) / parseFloat(numdem[1]);
    } else {
      // not fractions.  probably parseable
      exposure = parseFloat(choice.valueRaw);
    }

    if(!isNaN(exposure) && isFinite(exposure) && choice.ix >= 0 && isFinite(choice.ix)) {
      return {
        seconds: exposure,
        ix: choice.ix,
      };
    } else {
      return null;
    }
  });
  choices = choices.filter((choice) => !!choice);

  if(choices.length > 0) {
    // we got choices!

    // make sure the slowest is always first
    choices.sort((a, b) => a.seconds < b.seconds ? 1 : -1);

    return {
      fastestSelection: choices[choices.length - 1].ix,
      slowestSelection: choices[0].ix,
      deltaForFaster: choices[0].ix < choices[choices.length-1].ix ? 1 : -1,
      choices,
    }
  } else {
    throw new Error("Could not determine choices from " + raw);
  }
}

export function parseGPhoto2Isos(raw:string):GPhotoIsoChoice[] {
  const lines = raw.split('\n');
  
  const choiceLines = lines.filter((line) => line.startsWith('Choice:'));
  const choicesRaw = choiceLinesToSplits(choiceLines);
  let ret:GPhotoIsoChoice[] = choicesRaw.map((choice) => {

    const iso = parseInt(choice.valueRaw);
    if(iso > 0 && isFinite(iso) && !isNaN(iso)) {
      return {
        ix: choice.ix,
        iso
      }
    } else {
      return null;
    }
  })
  ret = ret.filter((choice) => !!choice);
  ret = ret.sort((a, b) => a.iso > b.iso ? 1 : -1);
  return ret;
}

function testParseGPhoto2Speeds() {
  const result = parseGPhoto2Speeds(sampleSpeeds);
  
  testAssert(result.choices.length === 52);
  testAssert(result.slowestSelection === 1);
  testAssert(result.fastestSelection === 52);
  testAssert(result.deltaForFaster === 1);

}
testParseGPhoto2Speeds();

function testParseGPhoto2IsoSpeeds() {
  const results = parseGPhoto2Isos(sampleIsos);
  
  testAssert(results.length === 7);
  testAssert(results[0].iso === 100);
  testAssert(results[6].iso === 6400);
  

}
testParseGPhoto2IsoSpeeds();