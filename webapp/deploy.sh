#!/bin/bash
set -e

npm run build
ssh art@fastsky.ca "mkdir -p /home/art/webapp"
scp -r build/* art@fastsky.ca:/home/art/webapp/
ssh root@fastsky.ca "cd /var/www && sudo ln -sfn /home/art/webapp ./html"
scp .htaccess art@fastsky.ca:/home/art/webapp/.htaccess