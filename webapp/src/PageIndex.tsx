import React, { useEffect, useState } from 'react';
import './PageIndex.scss';
import {Helmet} from 'react-helmet'

let base = 'http://fastsky.ca/api/';
let baseDebug = window.location.hostname === 'localhost' ? 'http://localhost:2702/' : base;

function refreshReactionCounts(id:number) {
  const reactionCountUrl = `${baseDebug}reaction-count?videoId=${id}`;
  return fetch(reactionCountUrl).then((response) => response.json());
}
const PageIndex = () => {

  const [videoUrl, setVideoUrl] = useState<string|undefined>(undefined);
  const [videoResponse, setVideoResponse] = useState<any>(undefined);
  const [reactionCount, setReactionCount] = useState<any>(undefined);
  const [videoPlaying, setVideoPlaying] = useState<boolean>(false);

  let videoMetaUrl = `${base}video`;

  useEffect(() => {
    fetch(videoMetaUrl).then((response) => response.json()).then((response) => {
      setVideoUrl(`http://fastsky.ca/videos/${response.handle}/${response.filename}`);
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


  useEffect(() => {
    // reaction counts
    if(videoResponse) {
      refreshReactionCounts(videoResponse.id).then((response) => {
        console.log("reaction count: ", response);
        setReactionCount(response);
      })
    }
  }, [videoResponse]);

  useEffect(() => {
    // progress animation
    let animReq:any;
    function paintFrame() { 
      const vid = document.querySelector('video');
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
        animReq = requestAnimationFrame(paintFrame);
      }

    }
    animReq = requestAnimationFrame(paintFrame);

    return function cleanup() {
      cancelAnimationFrame(animReq);
    }
  }, [videoUrl]);

  const onDownloadVideo = () => {
    onReact('download');
    if(videoUrl && videoResponse) {
      console.log("video response = ", videoResponse);
      const linky = document.createElement('a');
      linky.href = `${base}download-video?id=${videoResponse.id}`
      linky.download = `fastsky-video.mp4`;
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
      setVideoUrl(`http://fastsky.ca/videos/${response.handle}/${response.filename}`);
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
    }).finally(() => {
      refreshReactionCounts(videoResponse.id).then((response) => {
        console.log("reaction count: ", response);
        setReactionCount(response);
      })
    })
  }

  const onPlayPause = () => {
    const vid = document.querySelector('video');
    if(videoPlaying && vid) {
      vid.pause();
    } else if(!videoPlaying && vid) {
      vid.play();
    }
  }
  const onFaster = () => {
    const vid = document.querySelector('video');
    if(vid) {
      if(videoPlaying) {
        vid.playbackRate *= 1.25;
      } else {
        vid.currentTime += 1/30;
      }
    }
  }
  const onSlower = () => {
    const vid = document.querySelector('video');
    if(vid) {
      if(videoPlaying) {
        vid.playbackRate *= 0.8;
      } else {
        vid.currentTime-= 1/30;
      }
    }
  }

  return (
    <div className="Index__Video-Holder">
      <Helmet>
        <title>FastSky</title>
        <script src="https://kit.fontawesome.com/d8b18df8ff.js" crossOrigin={"anonymous" as any}></script>
      </Helmet>
      {videoUrl && (<>
        <video className="Index__Video" src={videoUrl} onPause={() => {console.log("pause"); setVideoPlaying(false)}} onPlaying={() => {console.log("playing"); setVideoPlaying(true)}} onLoad={onVideoLoad} autoPlay={true} loop={true} muted={true} onAbort={onError} onError={onError}>
        </video>
        <div className="Index__Video-Progress">
          <canvas className="Index__Video-Progress-Canvas"></canvas>
          <div className="Index__Video-Controls">
            <i className="fas fa-backward Index__Video-Control" onClick={onSlower}></i>
            {(videoPlaying && <i className="far fa-pause-circle Index__Video-Control Index__Video-PlayPause" onClick={onPlayPause}></i>) || <i className="far fa-play-circle Index__Video-Control Index__Video-PlayPause" onClick={onPlayPause}></i>}
            <i className="fas fa-forward Index__Video-Control" onClick={onFaster}></i>
          </div>
        </div>
        <div className="Index__Video-Reactions">
          <i onClick={onDownloadVideo} className="fas fa-download Index__Video-Reaction">
            {reactionCount && (<div className="Index__Video-Reaction--Count">{reactionCount.download || '0'}</div>)}
          </i>
          <i onClick={() => onReact('storm')} className="fas fa-poo-storm Index__Video-Reaction">
            {reactionCount && (<div className="Index__Video-Reaction--Count">{reactionCount.storm || '0'}</div>)}
          </i>
          <i onClick={() => onReact('wow')} className="fas fa-rainbow Index__Video-Reaction">
            {reactionCount && (<div className="Index__Video-Reaction--Count">{reactionCount.wow || '0'}</div>)}
          </i>
        </div>
        
      </>)}
    </div>
  )
}

export default PageIndex;