./install.sh
npm install


pushd .
cd ../webapp
npm install
popd

/opt/nodejs/bin/tsc
node ./dist/piapp/index.js