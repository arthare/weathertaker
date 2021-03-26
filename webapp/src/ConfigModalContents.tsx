import './Modal.scss';
import React, { useEffect, useState } from 'react';
import { GetConfigResponse } from './Configs/Types';
import './ConfigModalContents.scss';
import { ImageEffects } from '../webapp/src/Configs/Utils';

const ConfigModalContents = (props:{config:GetConfigResponse}) => {

  let [json, setJson] = useState(JSON.stringify(props.config.models, undefined, '\t'));
  let [model, setModel] = useState<any>(props.config.models);
  let [error, setError] = useState<boolean>(false);

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
      const image = await ImageEffects.prepareCanvasFromBuffer(Buffer.from(srcBase64, 'base64'));
      const canvas = document.createElement('canvas');

      const localModel = JSON.parse(JSON.stringify(model));
      localModel['CurrentTime'] = {tm: new Date().getTime(), pctDay}

      const newCanvas = await ImageEffects.process(image, localModel);
      fnDone(newCanvas.toDataURL());
    }
    doIt(props.config.noonBase64, setNoonImageEdited, 1.0);
    doIt(props.config.nightBase64, setNightImageEdited, 0);
  }, [model]);


  return (
    <div className={"ConfigModalContents__Container"}>
      <div className="ConfigModalContents__Images">
        <img className="ConfigModalContents__Images--Noon" src={noonImageDataUri} />
        <img className="ConfigModalContents__Images--Night" src={nightImageDataUri} />
      </div>
      <div className="ConfigModalContents__Images-After">
        <img className="ConfigModalContents__Images--Noon" src={noonImageEdited} />
        <img className="ConfigModalContents__Images--Night" src={nightImageEdited} />
      </div>
      <textarea className="ConfigModalContents__Text" style={{backgroundColor: error ? 'lightpink' : 'white'}} onChange={onChangeModel}>
        {json}
      </textarea>
    </div>
  )
}

export default ConfigModalContents;