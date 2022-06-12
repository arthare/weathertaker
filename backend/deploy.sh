tsc

SIGNIN=art@fastsky.ca
APIHOSTDIR=/home/art/t4c-api

ssh $SIGNIN "mkdir -p $APIHOSTDIR"
scp -r dist/* $SIGNIN:$APIHOSTDIR
scp ./pm2.json $SIGNIN:$APIHOSTDIR/pm2.json
scp ./package.json $SIGNIN:$APIHOSTDIR/package.json
scp ./db-config-prod.json $SIGNIN:$APIHOSTDIR/db-config.json
ssh $SIGNIN "cd $APIHOSTDIR && npm install"
ssh $SIGNIN "cd $APIHOSTDIR && pm2 restart pm2.json"
echo "Should be deployed!"