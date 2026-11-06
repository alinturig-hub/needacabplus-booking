'use client';
import {useEffect} from 'react';
import {requestInitialLocation,type BrowserPoint} from '@/lib/browser-location';
import {watchForegroundLocation} from '@/lib/live-location';
export function useInitialLocation(onLocation?:(point:BrowserPoint|null)=>void,live=false){
 useEffect(()=>{let active=true;let stop=()=>{};void requestInitialLocation().then(point=>{if(!active)return;if(point)onLocation?.(point);if(point&&live&&onLocation)stop=watchForegroundLocation(onLocation)});return()=>{active=false;stop()}},[onLocation,live]);
}
