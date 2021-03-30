source env-vars

./install.sh
npm install

pushd .
cd ../webapp
npm install
popd

mkdir -p ./tmp
echo "startup!" > ./tmp/startup.txt
git stash
git pull origin master
tsc
echo "startup!" > ./tmp/startup.txt

echo "starting main app pm2"
pm2 restart pm2.json

echo "starting watchdog app pm2"
pm2 restart pm2-watchdog.json

pm2 save
