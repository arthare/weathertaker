import React, { useEffect, useState } from 'react';
import './PageIndex.scss';


const PageIndex = () => {

  const [videoUrl, setVideoUrl] = useState<string|undefined>(undefined);

  let base = window.location.hostname === 'localhost' ? 'http://localhost:2702/' : 'http://172.105.26.34/api/';
  let videoMetaUrl = `${base}video`;

  useEffect(() => {
    fetch(videoMetaUrl).then((response) => response.json()).then((response) => {
      setVideoUrl(`http://172.105.26.34/videos/${response.handle}/${response.filename}`);
    })
  }, [videoMetaUrl]);

  const onVideoLoad = () => {
    console.log("on video load");
    document.querySelector('video')?.play();
  }

  const onError = (e:any) => {
    console.log("oh no, an error: ", e);
    fetch(videoMetaUrl).then((response) => response.json()).then((response) => {
      setVideoUrl(`http://172.105.26.34/videos/${response.handle}/${response.filename}`);
    })
  }

  return (
    <div className="Index__Video-Holder">
      {videoUrl && <video className="Index__Video" src={videoUrl} onLoad={onVideoLoad} autoPlay={true} loop={true} muted={true} onAbort={onError} onError={onError}></video>}
    </div>
  )
}

export default PageIndex;