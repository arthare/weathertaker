import React, { useEffect, useState } from 'react';
import './PageIndex.scss';
import {Helmet} from 'react-helmet'
import { useParams } from 'react-router-dom';
import Modal from './Modal';
import { GetConfigResponse, NewModelRequest } from './Configs/Types';
import ConfigModalContents from './ConfigModalContents';

let base = 'http://fastsky.ca/api/';
let baseDebug = window.location.hostname === 'localhost' ? 'http://localhost:2702/' : base;

function refreshReactionCounts(id:number) {
  const reactionCountUrl = `${baseDebug}reaction-count?videoId=${id}`;
  return fetch(reactionCountUrl).then((response) => response.json());
}
function readBlob(b:Blob):Promise<string> {
  return new Promise(function(resolve, reject) {
    const reader = new FileReader();

    reader.onloadend = function() {
      resolve(reader.result as string);
    };

    // TODO: hook up reject to reader.onerror somehow and try it

    reader.readAsDataURL(b);
  });
}

const PageIndex = () => {

  let params:{handle:string} = useParams<any>();
  console.log("index props: ", params);

  if(params?.handle) {
    try {
      window.localStorage.setItem('lastSource', JSON.stringify(params.handle));
    } catch(e) {}
  } else {
    // no handle?  maybe we have remembered your last one
    try {
      const handle = JSON.parse(window.localStorage.getItem('lastSource') || 'undefined');
      console.log("loaded handle of ", handle);
      params = {handle};
    } catch(e) {

    }
  }

  const [videoUrl, setVideoUrl] = useState<string|undefined>(undefined);
  const [videoResponse, setVideoResponse] = useState<any>(undefined);
  const [sourceResponse, setSourceResponse] = useState<any>(undefined);
  const [reactionCount, setReactionCount] = useState<any>(undefined);
  const [videoPlaying, setVideoPlaying] = useState<boolean>(false);
  const [showingConfig, setShowingConfig] = useState<boolean>(false);
  const [configData, setConfigData] = useState<GetConfigResponse|null>(null);
  const [lastImageDataUri, setLastImageDataUri] = useState<string>('');
  const [reloads, setReloads] = useState<number>(0);

  let videoMetaUrl = `${baseDebug}video`;
  let sourceMetaUrl = `${baseDebug}source`;
  let videoNextUrl = `${baseDebug}next-source`;
  let configUrl = `${baseDebug}config`;
  let lastImageUrl = `${base}last-image`;
  let modelUrl = `${baseDebug}models`;

  function doSizeCheck() {
    console.log("doing size check");
    const video:HTMLVideoElement|null = document.querySelector('.Index__Video');
    if(video) {

      const isPortrait = window.innerWidth < window.innerHeight;

      if(isPortrait) {
        video.style.left = '0px';
        video.style.top = '0px';
        video.style.width = `100vh`;
        video.style.height = `100vw`;
      } else {
        video.style.left = '0px';
        video.style.top = '0px';
        video.style.width = `100vw`;
        video.style.height = `100vh`;
      }
    } else {
      console.log("no video yet");
    }
  }

  useEffect(() => {
    // on startup, figure out sizing and make sure the video fits

    doSizeCheck();

    const onResize = () => doSizeCheck()
    window.addEventListener('resize',onResize);

    const win = window as any;
    win.dataLayer = win.dataLayer || [];
    function gtag(arg1:any, arg2:any){
      (win as any).dataLayer.push(arguments);
    }
    gtag('js', new Date());

    gtag('config', 'G-09T8G2TNSP');

    return function cleanup() {
      window.removeEventListener('resize', onResize);
    }
  }, []);

  useEffect(() => {
    let handleToFetch = (sourceResponse?.handle) || params.handle;
    console.log("reloads = ", reloads, ": fetching video uuid for ", handleToFetch);
    fetch(`${videoMetaUrl}?sourceHandle=${params.handle || ''}`).then((response) => response.json()).then((response) => {

      fetch(`${sourceMetaUrl}?id=${response.sourceId}`).then((r) => r.json()).then((source) => {
        setSourceResponse(source);
      })

      const newVideoUrl = `http://fastsky.ca/videos/${response.handle}/${response.filename}`;
      console.log("new video url for ", response, " is ", newVideoUrl);
      setVideoUrl(newVideoUrl);
      setVideoResponse(response);
      setTimeout(() => {
        console.log("reloading reloads ", reloads);
        setReloads(reloads + 1);
      }, 5 * 60000);
    })
  }, [reloads, params.handle]);

  const onVideoLoad = () => {
    console.log("on video load");
    doSizeCheck();

    const vid:HTMLVideoElement|null = document.querySelector('video.Index__Video');
    if(vid) {
      doSizeCheck();
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
      const vid:HTMLVideoElement|null = document.querySelector('video.Index__Video');
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
    console.log("error: ", e?.message, e);
    setReloads(reloads+1);
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
    const vid:HTMLVideoElement|null = document.querySelector('video.Index__Video');
    if(videoPlaying && vid) {
      doSizeCheck();
      vid.pause();
    } else if(!videoPlaying && vid) {
      vid.play();
    }
  }
  const onFaster = () => {
    const vid:HTMLVideoElement|null = document.querySelector('video.Index__Video');
    if(vid) {
      if(videoPlaying) {
        vid.currentTime += vid.duration / 12;
      } else {
        vid.currentTime += 1/30;
      }
    }
  }
  const onSlower = () => {
    const vid:HTMLVideoElement|null = document.querySelector('video.Index__Video');
    if(vid) {
      if(videoPlaying) {
        vid.currentTime -= vid.duration / 6;
      } else {
        vid.currentTime-= 1/30;
      }
    }
  }
  const onConfig = () => {
    return fetch(`${configUrl}?sourceId=${encodeURIComponent(sourceResponse.id)}`).then((response) => response.json()).then((config:GetConfigResponse) => {
      setConfigData(config);
      setShowingConfig(true);
    }, (failure) => {
      alert("Failed to retrieve configuration info");
    })
  }

  const onCloseConfig = () => {
    setShowingConfig(false);
  }

  const onNext = () => {
    const url = `${videoNextUrl}?id=${sourceResponse.id}`;
    console.log("trying to grab ", url);

    fetch(url).then((response) => response.json()).then((response) => {
      // this tells us the next source info to go to
      window.location.href = `/location/${response.handle}`;
    })
  }

  const onGetLastImage = () => {
    const url = `${lastImageUrl}?sourceId=${sourceResponse.id}`;
    console.log("trying to grab ", url);
    fetch(url).then((result) => {
      return result.blob();
    }).then((blob) => {
      return readBlob(blob)
    }).then((dataUri:string) => {
      setLastImageDataUri(dataUri);
    }).catch(() => {
      setLastImageDataUri('');
    })
  }

  const onMoveOverImagePreview = (e:any) => {
    var rect = e.target.getBoundingClientRect();
    var x = e.clientX - rect.left; //x position within the element.
    var y = e.clientY - rect.top;  //y position within the element.
    console.log("Left? : " + x + " ; Top? : " + y + ".");
    const pctX = x / e.target.width;
    const pctY = y / e.target.height;
    const realX = pctX * e.target.naturalWidth;
    const realY = pctY * e.target.naturalHeight;
    console.log("pctX = ", pctX, " pctY = ", pctY, realX, realY);
  }

  const onSendNewModel = async (pwd:string, model:any) => {
    const payload:NewModelRequest = {
      pwd,
      model,
      sourceId: sourceResponse.id,
    }
    await fetch(modelUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
  }

  return (
    <div className="Index__Video-Holder">
      <Helmet>
        <title>FastSky</title>
        <script src="https://kit.fontawesome.com/d8b18df8ff.js" crossOrigin={"anonymous" as any}></script>
        {/*<!-- Google tag (gtag.js) -->*/}
        <script async src="https://www.googletagmanager.com/gtag/js?id=G-09T8G2TNSP"></script>
        <script>
        </script>
      </Helmet>
      {videoUrl && (<>
        <div className="Index__Video-Progress">
          <canvas className="Index__Video-Progress-Canvas"></canvas>
          <div className="Index__Video-Controls">
            <i className="fas fa-backward Index__Video-Control" onClick={onSlower}></i>
            {(videoPlaying && <i className="far fa-pause-circle Index__Video-Control Index__Video-PlayPause" onClick={onPlayPause}></i>) || <i className="far fa-play-circle Index__Video-Control Index__Video-PlayPause" onClick={onPlayPause}></i>}
            <i className="fas fa-forward Index__Video-Control" onClick={onFaster}></i>
          </div>
        </div>

        <Modal showing={showingConfig} onClose={onCloseConfig}>
          {configData && <ConfigModalContents config={configData} onSendNewModel={onSendNewModel} />}
        </Modal>

        {sourceResponse && (
          <div className="Index__Video-Description">
            <div className="Index__Video-Texts">
              <div className="Index__Video-Title">{sourceResponse.name}</div>
              <div className="Index__Video-Subtitle">{sourceResponse.description}</div>
              <div className="Index__Video-Link">
                <a href={`/location/${sourceResponse.handle}`}>Link</a>
                <i className="fas fa-cogs" onClick={onConfig}></i>
                <i className="fas fa-image" onClick={onGetLastImage}></i>
                </div>
            </div>
            <div className="Index__Video-Skip">
              <i className="fas fa-step-forward" onClick={onNext}></i>
            </div>
          </div>
        )}

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
        <video className="Index__Video" src={videoUrl} onPause={() => {console.log("pause"); setVideoPlaying(false)}} onPlaying={() => {console.log("playing"); doSizeCheck(); setVideoPlaying(true)}} onLoad={onVideoLoad} autoPlay={true} loop={true} muted={true} onError={onError}></video>
        {lastImageDataUri && (
          <div className="Index__Video-LastImageModal">
            <img className="Index__Video-LastImage" src={lastImageDataUri} onMouseMove={onMoveOverImagePreview}></img>
            <button className="Index__Video-LastImageModal--Button" onClick={() => setLastImageDataUri('')}>Close</button>
          </div>
        )}
        
        
      </>)}
    </div>
  )
}

export default PageIndex;