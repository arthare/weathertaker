import React, { useState } from 'react';


function resizeImage(originalBase64:string, maxWidth:number, maxHeight:number):Promise<string> {

  return new Promise((resolve) => {
    var img = new Image;
    img.onload = function() {
      const aspect = img.width / img.height;

      let desiredHeight = 922;
      let desiredWidth = 1640;
  
      var canvas = document.createElement('canvas');
      canvas.width = desiredWidth;
      canvas.height = desiredHeight;
      canvas.style.width = desiredWidth + 'px';
      canvas.style.height = desiredHeight + 'px';
      canvas.style.position = 'fixed';
      canvas.style.left = '-10000px';
      canvas.style.top = '0px';
      canvas.style.zIndex = '10000';
      canvas.style.border = "1px solid black";
      document.body.appendChild(canvas);
  
      var ctx = canvas.getContext('2d');
      if(ctx){
        ctx.drawImage(img, 0, 0, desiredWidth, desiredHeight);
    
        var newDataUri = canvas.toDataURL('image/jpeg', 0.75);
        document.body.removeChild(canvas);
        resolve(newDataUri);
      }
    }
    img.src = originalBase64;
  })


}

const PageIndex = () => {

  let [submittedImage, setSubmittedImage] = useState('');

  const onLoad = (evt:any) => {

    const files = evt.target.files;
    const fr = new FileReader();
    fr.onload = (theFile) => {
      if(theFile && theFile.target) {
        const asArrayBuffer:Buffer = Buffer.from(theFile.target.result as ArrayBuffer);
        const asBase64 = asArrayBuffer.toString('base64');
        const asDataUri = `data:${files[0].type};base64,${asBase64}`;
        return resizeImage(asDataUri, 1640, 922).then((resizedDownDataUri:string) => {

          const data = {
            apiKey: 'art-test',
            imageBase64: resizedDownDataUri.slice(resizedDownDataUri.indexOf(',') + 1),
          }

          const base = window.location.hostname === 'localhost' ? 'http://localhost:2702' : 'http://t4c.ca/api'
          return fetch(`${base}/image-submission`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: data && JSON.stringify(data),
          }).then((success) => success.json()).then((success) => {
            // success!  this should be an ID number we can use to retrieve our image
            return fetch(`${base}/image?id=${success}`).then((image) => image.json()).then((image) => {
              setSubmittedImage(`data:${image.mime};base64,${image.base64}`);
            })
          })
        })
      }
    }
    fr.readAsArrayBuffer(files[0]);
  }

  return (
    <div>
      <input id={"file-load"} className="Index__Input"type="file" accept="image/*" onChange={onLoad} capture />
      <img src={submittedImage} />
    </div>
  )
}

export default PageIndex;