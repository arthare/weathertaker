import './Modal.scss';
import React from 'react';


const Modal = (props:{children:any, showing:boolean, onClose:()=>void}) => {

  return (
    <div className={"Modal__Container " + (props.showing ? 'Showing' : '')}>
      <div className="Modal__Contents">
        {props.children}

      </div>
      <a href='#' onClick={props.onClose}>Close</a>
    </div>
  )
}

export default Modal;