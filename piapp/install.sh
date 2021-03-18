
echo "Installing node-canvas dependencies"
sudo apt-get install build-essential libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev -y
sudo npm install -g typescript@3.7.4
sudo npm install -g pm2@4.4.1
git pull origin master

echo "There are still some things for humans to do:"
echo "1) Make sure you've done a sudo apt-get update and sudo apt-get upgrade to get the latest raspistill!  The stock one tends to not like long exposures."
echo "2) Make sure you've enabled the raspi camera port (sudo raspi-config)"
echo "3) Make sure you've turned on wifi"
echo "4) Make sure you've set up config.json with your apikey"