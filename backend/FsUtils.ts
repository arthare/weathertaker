import fs from 'fs';
import { platform } from 'os';

export function guaranteePath(name:string) {

  if(!name.endsWith('/') && !name.endsWith('\\')) {
    const lastSlash = Math.max(name.lastIndexOf('/'), name.lastIndexOf('\\'));
    name = name.substr(0, lastSlash);
  }

  try {
    fs.mkdirSync(name, {recursive:true});
  } catch(e) {
    debugger;
  }
}