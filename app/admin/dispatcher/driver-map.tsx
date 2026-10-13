'use client';

import {useEffect,useRef,useState} from 'react';
import maplibregl,{Map as MapLibreMap,Marker,Popup} from 'maplibre-gl';
import {configuredMapStyle,openStreetMapStyle} from '@/lib/browser-map-style';
import {driverMarker,driverPopup,updateDriverMarker} from '../driver-map-presentation';
import type {DriverMapDetails} from '../driver-map-presentation';
import styles from './workspace.module.css';

export type MapDriver=DriverMapDetails&{driverId:string;vehicleId:string;vehicleCallsign:string|null;zone?:string|null;latitude:number;longitude:number};
type MapZone={externalId:string;name:string;latitude:number|null;longitude:number|null};
const center:[number,number]=[-4.143,50.374];
const coordinate=(driver:MapDriver)=>[driver.longitude,driver.latitude] as [number,number];
const valid=(driver:MapDriver)=>Number.isFinite(driver.latitude)&&Number.isFinite(driver.longitude)&&Math.abs(driver.latitude)<=90&&Math.abs(driver.longitude)<=180;

export default function DispatcherDriverMap({drivers,zones,selectedZone,selectedDriver,onSelect}:{drivers:MapDriver[];zones:MapZone[];selectedZone:string;selectedDriver:string;onSelect:(vehicleId:string)=>void}){
 const container=useRef<HTMLDivElement>(null);
 const mapRef=useRef<MapLibreMap|null>(null);
 const markers=useRef(new Map<string,Marker>());
 const fitted=useRef(false);
 const centeredZone=useRef('');
 const centeredDriver=useRef('');
 const [ready,setReady]=useState(false);

 useEffect(()=>{
  if(!container.current)return;
  let disposed=false;
  const mountedMarkers=markers.current;
  const controller=new AbortController();
  void configuredMapStyle('dark',controller.signal).then(style=>{
   if(disposed||!container.current)return;
   const map=new MapLibreMap({container:container.current,style:style||openStreetMapStyle,center,zoom:11,attributionControl:{compact:true}});
   map.addControl(new maplibregl.NavigationControl({showCompass:false}),'top-right');
   mapRef.current=map;
   setReady(true);
  }).catch(()=>{
   if(disposed||!container.current)return;
   const map=new MapLibreMap({container:container.current,style:openStreetMapStyle,center,zoom:11,attributionControl:{compact:true}});
   mapRef.current=map;
   setReady(true);
  });
  return()=>{disposed=true;controller.abort();for(const marker of mountedMarkers.values())marker.remove();mountedMarkers.clear();mapRef.current?.remove();mapRef.current=null};
 },[]);

 useEffect(()=>{
  const map=mapRef.current;if(!ready||!map)return;
  const current=markers.current;
  const validDrivers=drivers.filter(valid);
  const ids=new Set(validDrivers.map(driver=>driver.vehicleId));
  for(const [id,marker] of current)if(!ids.has(id)){marker.remove();current.delete(id)}
  for(const driver of validDrivers){
   const id=driver.vehicleId;
   const label=driver.vehicleCallsign||driver.callsign||id;
   const existing=current.get(id);
   const element=existing?.getElement()||driverMarker({...driver,callsign:label},id);
   if(!existing){element.addEventListener('click',()=>onSelect(id))}
   updateDriverMarker(element,{...driver,callsign:label},id);
   element.classList.toggle(styles.mapMarkerDim,Boolean(selectedZone&&driver.zone&&driver.zone!==selectedZone));
   element.classList.toggle(styles.mapMarkerSelected,id===selectedDriver);
   const popup=driverPopup({...driver,callsign:label},id);
   if(existing){existing.setLngLat(coordinate(driver));existing.getPopup()?.setDOMContent(popup)}
   else current.set(id,new Marker({element}).setLngLat(coordinate(driver)).setPopup(new Popup({offset:28,closeButton:true,closeOnClick:false,className:'driver-popup-wrap',maxWidth:'min(410px, calc(100vw - 32px))'}).setDOMContent(popup)).addTo(map));
  }
  if(!fitted.current&&validDrivers.length){
   fitted.current=true;
   if(validDrivers.length===1)map.flyTo({center:coordinate(validDrivers[0]),zoom:13,duration:0});
   else{const bounds=new maplibregl.LngLatBounds();for(const driver of validDrivers)bounds.extend(coordinate(driver));map.fitBounds(bounds,{padding:50,maxZoom:13,duration:0})}
  }
 },[drivers,onSelect,ready,selectedDriver,selectedZone]);

 useEffect(()=>{
  const map=mapRef.current;if(!ready||!map||!selectedDriver)return;
  if(centeredDriver.current===selectedDriver)return;
  const driver=drivers.find(item=>item.vehicleId===selectedDriver&&valid(item));
  if(driver){centeredDriver.current=selectedDriver;map.flyTo({center:coordinate(driver),zoom:Math.max(map.getZoom(),13),duration:650})}
 },[drivers,ready,selectedDriver]);

 useEffect(()=>{if(!selectedDriver)centeredDriver.current=''},[selectedDriver]);

 useEffect(()=>{
  const map=mapRef.current;if(!ready||!map)return;
  if(!selectedZone){centeredZone.current='';return}
  if(centeredZone.current===selectedZone)return;
  const zone=zones.find(item=>item.name===selectedZone);
  if(zone&&zone.latitude!==null&&zone.longitude!==null&&Number.isFinite(zone.latitude)&&Number.isFinite(zone.longitude)){centeredZone.current=selectedZone;map.flyTo({center:[zone.longitude,zone.latitude],zoom:12,duration:650})}
 },[ready,selectedZone,zones]);

 return <div ref={container} className={styles.mapCanvas} role="region" aria-label="Live driver map"/>;
}
