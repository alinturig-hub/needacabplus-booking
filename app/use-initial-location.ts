'use client';
import {useEffect} from 'react';
import {requestInitialLocation,type BrowserPoint} from '@/lib/browser-location';
export function useInitialLocation(onLocation?:(point:BrowserPoint)=>void){
 useEffect(()=>{let active=true;void requestInitialLocation().then(point=>{if(active&&point)onLocation?.(point)});return()=>{active=false}},[onLocation]);
}
