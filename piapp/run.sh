./install.sh
npm install


pushd .
cd ../webapp
npm install
popd

mkdir -p ./tmp
echo "startup!" > ./tmp/startup.txt
/opt/nodejs/bin/tsc
echo "startup!" > ./tmp/startup.txt
/opt/nodejs/bin/pm2 restart pm2.json
/opt/nodejs/bin/pm2 restart pm2-watchdog.json

