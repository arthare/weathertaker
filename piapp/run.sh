./install.sh
npm install


pushd .
cd ../webapp
npm install
popd

/opt/nodejs/bin/tsc
/opt/nodejs/bin/pm2 restart pm2.json