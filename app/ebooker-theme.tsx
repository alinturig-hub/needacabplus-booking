'use client';
import {useEffect,useRef} from 'react';
import {SunMoon} from 'lucide-react';

type Theme='system'|'light'|'dark';
const preference=(value:string|null):Theme=>value==='light'||value==='dark'?value:'system';
function apply(value:Theme){document.documentElement.dataset.theme=value==='system'?(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):value}

export default function EbookerTheme(){
 const select=useRef<HTMLSelectElement>(null);
 useEffect(()=>{
  const media=matchMedia('(prefers-color-scheme: dark)');
  const restore=()=>{let saved:Theme='system';try{saved=preference(localStorage.getItem('nac-theme'))}catch{/* System mode remains usable when storage is blocked. */}if(select.current)select.current.value=saved;apply(saved)};
  const syncSystem=()=>{if(select.current?.value==='system')apply('system')};
  const syncStorage=(event:StorageEvent)=>{if(event.key==='nac-theme'||event.key===null)restore()};
  restore();media.addEventListener('change',syncSystem);window.addEventListener('storage',syncStorage);
  return()=>{media.removeEventListener('change',syncSystem);window.removeEventListener('storage',syncStorage)};
 },[]);
 return <label className="eb-theme" title="Colour theme"><SunMoon size={19} aria-hidden="true"/><select ref={select} aria-label="Colour theme" defaultValue="system" onChange={event=>{const value=preference(event.target.value);apply(value);try{localStorage.setItem('nac-theme',value)}catch{/* Keep the selected theme for this visit. */}}}><option value="system">System theme</option><option value="light">Light theme</option><option value="dark">Dark theme</option></select></label>;
}
