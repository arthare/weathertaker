export function testAssert(f, reason?) {
  if(!f) {
    debugger;
    throw new Error("Shouldn't happen " + reason);
  }
}