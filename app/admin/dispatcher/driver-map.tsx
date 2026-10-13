'use client';

import {useEffect,useRef,useState} from 'react';
import type {Map as LeafletMap,Marker as LeafletMarker} from 'leaflet';
import {driverMarker,driverPopup} from '../driver-map-presentation';
import type {DriverMapDetails} from '../driver-map-presentation';
import styles from './workspace.module.css';

export type MapDriver=DriverMapDetails&{driverId:string;vehicleId:string;vehicleCallsign:string|null;zone?:string|null;latitude:number;longitude:number};
type MapZone={externalId:string;name:string;latitude:number|null;longitude:number|null};
const center:[number,number]=[50.374,-4.143];
const coordinate=(driver:MapDriver)=>[driver.latitude,driver.longitude] as [number,number];
const valid=(driver:MapDriver)=>Number.isFinite(driver.latitude)&&Number.isFinite(driver.longitude)&&Math.abs(driver.latitude)<=90&&Math.abs(driver.longitude)<=180;
function icon(L:typeof import('leaflet'),driver:MapDriver,label:string){
 return L.divIcon({className:'fleet-vehicle-div-icon',html:driverMarker({...driver,callsign:label},driver.vehicleId).outerHTML,iconSize:[48,70],iconAnchor:[24,42],popupAnchor:[0,-38]});
}

export default function DispatcherDriverMap({drivers,zones,selectedZone,selectedDriver,onSelect}:{drivers:MapDriver[];zones:MapZone[];selectedZone:string;selectedDriver:string;onSelect:(vehicleId:string)=>void}){
 const container=useRef<HTMLDivElement>(null);
 const mapRef=useRef<LeafletMap|null>(null);
 const leafletRef=useRef<typeof import('leaflet')|null>(null);
 const markers=useRef(new Map<string,LeafletMarker>());
 const markerAppearance=useRef(new Map<string,string>());
 const onSelectRef=useRef(onSelect);
 const fitted=useRef(false);
 const centeredZone=useRef('');
 const centeredDriver=useRef('');
 const [ready,setReady]=useState(false);
 useEffect(()=>{onSelectRef.current=onSelect},[onSelect]);

 useEffect(()=>{
  let disposed=false;
  let observer:ResizeObserver|null=null;
  const mountedMarkers=markers.current;
  const appearance=markerAppearance.current;
  void import('leaflet').then(({default:L})=>{
   if(disposed||!container.current)return;
   leafletRef.current=L;
   const map=L.map(container.current,{center,zoom:11,zoomControl:true,scrollWheelZoom:true});
   L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap contributors',maxZoom:19}).addTo(map);
   mapRef.current=map;
   observer=new ResizeObserver(()=>map.invalidateSize({pan:false}));
   observer.observe(container.current);
   requestAnimationFrame(()=>{if(!disposed)map.invalidateSize({pan:false})});
   setReady(true);
  });
  return()=>{disposed=true;observer?.disconnect();mountedMarkers.clear();appearance.clear();mapRef.current?.remove();mapRef.current=null;leafletRef.current=null};
 },[]);

 useEffect(()=>{
  const map=mapRef.current,L=leafletRef.current;if(!ready||!map||!L)return;
  const current=markers.current;
  const validDrivers=drivers.filter(valid);
  const ids=new Set(validDrivers.map(driver=>driver.vehicleId));
  for(const [id,marker] of current)if(!ids.has(id)){marker.remove();current.delete(id);markerAppearance.current.delete(id)}
  for(const driver of validDrivers){
   const id=driver.vehicleId;
   const label=driver.vehicleCallsign||driver.callsign||id;
   const appearance=`${label}|${driver.operationalStatus||driver.vehicleStatus}|${driver.isLive}`;
   let marker=current.get(id);
   if(marker){
    marker.setLatLng(coordinate(driver));
    if(markerAppearance.current.get(id)!==appearance)marker.setIcon(icon(L,driver,label));
    marker.setPopupContent(driverPopup({...driver,callsign:label},id));
   }else{
    marker=L.marker(coordinate(driver),{icon:icon(L,driver,label),keyboard:true})
     .bindPopup(driverPopup({...driver,callsign:label},id),{className:'driver-popup-wrap',maxWidth:410,autoPan:true})
     .on('click',()=>onSelectRef.current(id))
     .addTo(map);
    current.set(id,marker);
   }
   markerAppearance.current.set(id,appearance);
   marker.getElement()?.classList.toggle(styles.mapMarkerDim,Boolean(selectedZone&&driver.zone&&driver.zone!==selectedZone));
   marker.getElement()?.classList.toggle(styles.mapMarkerSelected,id===selectedDriver);
  }
  if(!fitted.current&&validDrivers.length){
   fitted.current=true;
   map.invalidateSize({pan:false});
   if(validDrivers.length===1)map.setView(coordinate(validDrivers[0]),13,{animate:false});
   else map.fitBounds(L.latLngBounds(validDrivers.map(coordinate)),{padding:[40,40],maxZoom:13,animate:false});
  }
 },[drivers,ready,selectedDriver,selectedZone]);

 useEffect(()=>{
  const map=mapRef.current;if(!ready||!map||!selectedDriver)return;
  if(centeredDriver.current===selectedDriver)return;
  const driver=drivers.find(item=>item.vehicleId===selectedDriver&&valid(item));
  if(driver){centeredDriver.current=selectedDriver;map.flyTo(coordinate(driver),Math.max(map.getZoom(),13),{duration:.65})}
 },[drivers,ready,selectedDriver]);

 useEffect(()=>{if(!selectedDriver)centeredDriver.current=''},[selectedDriver]);

 useEffect(()=>{
  const map=mapRef.current;if(!ready||!map)return;
  if(!selectedZone){centeredZone.current='';return}
  if(centeredZone.current===selectedZone)return;
  const zone=zones.find(item=>item.name===selectedZone);
  if(zone&&zone.latitude!==null&&zone.longitude!==null&&Number.isFinite(zone.latitude)&&Number.isFinite(zone.longitude)){centeredZone.current=selectedZone;map.flyTo([zone.latitude,zone.longitude],12,{duration:.65})}
 },[ready,selectedZone,zones]);

 return <div ref={container} className={styles.mapCanvas} role="region" aria-label="Live driver map"/>;
}
