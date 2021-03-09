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