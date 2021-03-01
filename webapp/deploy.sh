npm run build
ssh art@t4c.ca "mkdir -p /home/art/webapp"
scp -r build/* art@t4c.ca:/home/art/webapp/
ssh root@t4c.ca "cd /var/www && sudo ln -sfn /home/art/webapp ./html"
scp .htaccess art@t4c.ca:/home/art/webapp/.htaccess