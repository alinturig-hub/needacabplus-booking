'use client';
import {useSyncExternalStore} from 'react';

export type InterfaceSettings={density:'comfortable'|'compact';reduceMotion:boolean;theme:'dark'|'light'};
const key='nac_admin_interface_v1',eventName='nac-admin-interface';
const defaults:InterfaceSettings={density:'comfortable',reduceMotion:false,theme:'dark'};
let lastRaw='',lastValue=defaults;
function read(){if(typeof window==='undefined')return defaults;try{const raw=localStorage.getItem(key)||'';if(raw===lastRaw)return lastValue;const parsed=JSON.parse(raw) as Partial<InterfaceSettings>;lastRaw=raw;lastValue={density:parsed.density==='compact'?'compact':'comfortable',reduceMotion:parsed.reduceMotion===true,theme:parsed.theme==='light'?'light':'dark'};return lastValue}catch{return defaults}}
function subscribe(callback:()=>void){window.addEventListener('storage',callback);window.addEventListener(eventName,callback);return()=>{window.removeEventListener('storage',callback);window.removeEventListener(eventName,callback)}}
export function useAdminInterface(){return useSyncExternalStore(subscribe,read,()=>defaults)}
export function saveAdminInterface(value:InterfaceSettings){localStorage.setItem(key,JSON.stringify(value));window.dispatchEvent(new Event(eventName))}
