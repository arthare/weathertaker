./install.sh
npm install


pushd .
cd ../webapp
npm install
popd

/opt/nodejs/bin/tsc
pm2 restart pm2.json