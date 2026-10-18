'use client';
import {useEffect,useRef,type ReactNode} from 'react';
import {createPortal} from 'react-dom';
import {X} from 'lucide-react';
export default function RideOverlay({title,onClose,children}:{title:string;onClose:()=>void;children:ReactNode}){
 const ref=useRef<HTMLDialogElement>(null);
 useEffect(()=>{const dialog=ref.current;dialog?.showModal();return()=>dialog?.close()},[]);
 return createPortal(<dialog ref={ref} className="ride-overlay premium-booking" aria-label={title} onCancel={event=>{event.preventDefault();onClose()}}><header><button type="button" aria-label={`Close ${title.toLowerCase()}`} onClick={onClose}><X/></button></header><div className="ride-overlay-body"><h1>{title}</h1>{children}</div></dialog>,document.body);
}
