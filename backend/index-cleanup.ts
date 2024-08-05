import Db from "./Db";

async function doIt() {
  while(true) {
    await Db.tickCleanImages(10000);
  }
}

doIt();