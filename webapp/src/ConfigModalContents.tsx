import './Modal.scss';
import React, { useState } from 'react';
import { GetConfigResponse } from './Configs/Types';
import './ConfigModalContents.scss';

const ConfigModalContents = (props:{config:GetConfigResponse}) => {

  let [json, setJson] = useState(JSON.stringify(props.config.models, undefined, '\t'));


  const noonImageDataUri = `data:image/jpeg;base64,${props.config.noonBase64}`;
  const nightImageDataUri = `data:image/jpeg;base64,${props.config.nightBase64}`;

  return (
    <div className={"ConfigModalContents__Container"}>
      <div className="ConfigModalContents__Images">
        <img className="ConfigModalContents__Images--Noon" src={noonImageDataUri} />
        <img className="ConfigModalContents__Images--Night" src={nightImageDataUri} />
      </div>
      <textarea className="ConfigModalContents__Text">
        {json}
      </textarea>
    </div>
  )
}

export default ConfigModalContents;