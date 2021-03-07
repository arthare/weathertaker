import React, { useEffect, useState } from 'react';
import './PageIndex.scss';
import {Helmet} from 'react-helmet'

const PageIndex = () => {

  const [videoUrl, setVideoUrl] = useState<string|undefined>(undefined);
  const [videoResponse, setVideoResponse] = useState<any>(undefined);

  let base = 'http://172.105.26.34/api/';
  let baseDebug = window.location.hostname === 'localhost' ? 'http://localhost:2702/' : base;
  let videoMetaUrl = `${base}video`;

  useEffect(() => {
    fetch(videoMetaUrl).then((response) => response.json()).then((response) => {
      setVideoUrl(`http://172.105.26.34/videos/${response.handle}/${response.filename}`);
      setVideoResponse(response);
    })
  }, [videoMetaUrl]);

  const onVideoLoad = () => {
    console.log("on video load");
    const vid = document.querySelector('video');
    if(vid) {
      vid.play();
    }
  }
  const onVideoPlay = () => {
    console.log("onVideoPlay");
    const vid = document.querySelector('video');
    if(vid) {
      vid.ontimeupdate = (evt) => {
        const canvas:HTMLCanvasElement|null = document.querySelector('canvas.Index__Video-Progress-Canvas');
        const ctx = canvas?.getContext('2d');
        if(vid && canvas && ctx) {
          const pct = vid.currentTime / vid.duration;
          canvas.width = canvas.clientWidth;
          canvas.height = canvas.clientHeight;

          const circleWidth = Math.min(canvas.width, canvas.height) - 10;
          //ctx.fillStyle = 'red';
          //ctx.fillRect(0,0,canvas.width, canvas.height);
          ctx.strokeStyle = 'rgba(255,255,255,0.3)';
          ctx.lineWidth = circleWidth/8;
          ctx.beginPath();
          ctx.arc(canvas.width/2,canvas.height/2,circleWidth/2,0, 2*pct*Math.PI);
          ctx.stroke();

        }
        console.log("vid.current ", vid?.currentTime, vid?.duration);
      }
    }

  }
  const onDownloadVideo = () => {
    if(videoUrl && videoResponse) {
      console.log("video response = ", videoResponse);
      const linky = document.createElement('a');
      linky.href = `${base}download-video?handle=${videoResponse.handle}&filename=${videoResponse.filename}`
      linky.download = `weathertaker-video.mp4`;
      linky.target="_blank";
      linky.download = "true";
      document.body.appendChild(linky);
      linky.click();
      document.body.removeChild(linky);
    }
  }

  const onError = (e:any) => {
    console.log("oh no, an error: ", e);
    fetch(videoMetaUrl).then((response) => response.json()).then((response) => {
      setVideoUrl(`http://172.105.26.34/videos/${response.handle}/${response.filename}`);
    })
  }

  const onReact = (how:any) => {
    const payload:any = {how, videoId: videoResponse.id};
    fetch(`${baseDebug}react`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })
  }

  return (
    <div className="Index__Video-Holder">
      <Helmet>
        <title>Test</title>
        <script src="https://kit.fontawesome.com/d8b18df8ff.js" crossOrigin={"anonymous" as any}></script>
      </Helmet>
      {videoUrl && (<>
        <video className="Index__Video" src={videoUrl} onPlaying={()=>onVideoPlay()} onLoad={onVideoLoad} autoPlay={true} loop={true} muted={true} onAbort={onError} onError={onError}>
        </video>
        <div className="Index__Video-Progress">
          <canvas className="Index__Video-Progress-Canvas"></canvas>
        </div>
        <div className="Index__Video-Reactions">
          <i onClick={onDownloadVideo} className="fas fa-download Index__Video-Reaction"></i>
          <i onClick={() => onReact('storm')} className="fas fa-poo-storm Index__Video-Reaction"></i>
          <i onClick={() => onReact('wow')} className="fas fa-rainbow Index__Video-Reaction"></i>
        </div>
        
      </>)}
    </div>
  )
}

export default PageIndex;