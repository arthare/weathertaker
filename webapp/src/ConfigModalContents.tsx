import './Modal.scss';
import React, { useEffect, useState } from 'react';
import { GetConfigResponse } from './Configs/Types';
import './ConfigModalContents.scss';
import { ImageEffects } from './Configs/Utils';

const ConfigModalContents = (props:{config:GetConfigResponse, onSendNewModel:(pwd:string, model:any)=>Promise<any>}) => {

  console.log("config modal props ", props);
  let [json, setJson] = useState(JSON.stringify(props.config.models, undefined, '\t'));
  let [model, setModel] = useState<any>(props.config.models);
  let [error, setError] = useState<boolean>(false);
  const [apiKey, setApiKey] = useState<string>('');

  let [noonImageEdited, setNoonImageEdited] = useState<string>(props.config.noonBase64);
  let [nightImageEdited, setNightImageEdited] = useState<string>(props.config.nightBase64);


  const noonImageDataUri = `data:image/jpeg;base64,${props.config.noonBase64}`;
  const nightImageDataUri = `data:image/jpeg;base64,${props.config.nightBase64}`;

  const onChangeModel = (evt:any) => {
    try {
      const parsed = JSON.parse(evt.target.value);
      setModel(parsed);
      setError(false);
    } catch(e) {
      setError(true);
    }
  }

  useEffect(() => {
    // the model changed, so we need to redo the edited images
    async function doIt(srcBase64:string, fnDone:(dataUri:string)=>void, pctDay:number) {
      if(srcBase64) {
        const localModel = JSON.parse(JSON.stringify(model));
        localModel['CurrentTime'] = {tm: new Date().getTime(), pctDay}
        const image = await ImageEffects.prepareCanvasFromBuffer(Buffer.from(srcBase64, 'base64'), () => document.createElement('img'));
        const newCanvas = await ImageEffects.process(image as any, localModel);
        fnDone(newCanvas.toDataURL());
      }

    }
    doIt(props.config.noonBase64, setNoonImageEdited, 1.0);
    doIt(props.config.nightBase64, setNightImageEdited, 0);
  }, [model]);

  const submitModelChange = async () => {
    try {
      const parsed = model;
      let pwd:string|null = apiKey;
      if(!pwd) {
        pwd = prompt("Enter your password.  Talk to Art to get it.", "");
      }
      if(pwd) {
        try {
          await props.onSendNewModel(pwd, parsed);
          setApiKey(pwd); // successful submission -> save the password so we don't need it again
          alert("Updated!");
        } catch(e:any) {
          alert("Failed to send your new instructions.  " + e?.message);
        }
      } else {

      }
    } catch(e) {
      alert("Failed to parse your instructions.  Make sure it is valid JSON.");
    }
  }

  return (
    <div className={"ConfigModalContents__Container"}>
      {noonImageEdited && (
        <div className="ConfigModalContents__Images">
          <img className="ConfigModalContents__Images--Noon" src={noonImageDataUri} />
          <img className="ConfigModalContents__Images--Night" src={nightImageDataUri} />
        </div>
      ) || <div>You don't have a noon sample image.  Just wait.</div>}
      {nightImageEdited && (
        <div className="ConfigModalContents__Images-After">
          <img className="ConfigModalContents__Images--Noon" src={noonImageEdited} />
          <img className="ConfigModalContents__Images--Night" src={nightImageEdited} />
        </div>
      ) || <div>You don't have a night sample image.  Just wait.</div>}
      <textarea className="ConfigModalContents__Text" style={{backgroundColor: error ? 'lightpink' : 'white'}} onChange={onChangeModel}>
        {json}
      </textarea>
      <button onClick={submitModelChange}>Apply Change</button>
    </div>
  )
}

export default ConfigModalContents;