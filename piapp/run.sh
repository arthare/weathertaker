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

echo "starting main app pm2"
/opt/nodejs/bin/pm2 restart pm2.json
pm2 restart pm2.json

echo "starting watchdog app pm2"
/opt/nodejs/bin/pm2 restart pm2-watchdog.json
pm2 restart pm2-watchdog.json

