./install.sh
npm install


pushd .
cd ../webapp
npm install
popd

echo "startup!" > ./tmp/startup.txt
/opt/nodejs/bin/tsc
echo "startup!" > ./tmp/startup.txt
/opt/nodejs/bin/pm2 restart pm2.json
/opt/nodejs/bin/pm2 restart pm2-watchdog.json

