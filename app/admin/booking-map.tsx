'use client';
import {useEffect,useRef} from 'react';
import maplibregl,{LngLatBounds,Map as MapLibreMap,Marker} from 'maplibre-gl';
import {configuredMapStyle} from '@/lib/browser-map-style';

export type Point={latitude:number;longitude:number;label:string};
type BookingMapProps={pickup:Point;destination:Point};

export default function BookingMap({pickup,destination}:BookingMapProps){
 const container=useRef<HTMLDivElement>(null);
 const pickupLatitude=pickup.latitude,pickupLongitude=pickup.longitude,pickupLabel=pickup.label;
 const destinationLatitude=destination.latitude,destinationLongitude=destination.longitude,destinationLabel=destination.label;
 useEffect(()=>{
  if(!container.current)return;
  const abort=new AbortController();
  const timeout=window.setTimeout(()=>abort.abort(),4500);
  const markers:Marker[]=[];let map:MapLibreMap|null=null,disposed=false;
  void configuredMapStyle('dark',abort.signal).then(style=>{if(disposed||!container.current)return;map=new MapLibreMap({container:container.current,style,center:[(pickupLongitude+destinationLongitude)/2,(pickupLatitude+destinationLatitude)/2],zoom:12,attributionControl:{compact:true}});
   map.addControl(new maplibregl.NavigationControl({showCompass:false}),'top-right');
   for(const [point,type] of [[{latitude:pickupLatitude,longitude:pickupLongitude,label:pickupLabel},'pickup'],[{latitude:destinationLatitude,longitude:destinationLongitude,label:destinationLabel},'destination']] as const){const element=document.createElement('div');element.className=`booking-map-marker ${type}`;element.setAttribute('aria-label',point.label);markers.push(new Marker({element}).setLngLat([point.longitude,point.latitude]).setPopup(new maplibregl.Popup({offset:24}).setText(point.label)).addTo(map))}
   const bounds=new LngLatBounds().extend([pickupLongitude,pickupLatitude]).extend([destinationLongitude,destinationLatitude]);map.fitBounds(bounds,{padding:70,maxZoom:15,duration:0});
   map.once('load',async()=>{
   let coordinates:number[][]=[[pickupLongitude,pickupLatitude],[destinationLongitude,destinationLatitude]];
   try{const response=await fetch(`https://router.project-osrm.org/route/v1/driving/${pickupLongitude},${pickupLatitude};${destinationLongitude},${destinationLatitude}?overview=full&geometries=geojson`,{signal:abort.signal});if(response.ok){const result=await response.json() as {routes?:{geometry?:{coordinates?:number[][]}}[]};const routed=result.routes?.[0]?.geometry?.coordinates;if(routed?.length)coordinates=routed}}catch{}
    if(abort.signal.aborted||!map)return;map.addSource('route',{type:'geojson',data:{type:'Feature',properties:{},geometry:{type:'LineString',coordinates}}});map.addLayer({id:'route-outline',type:'line',source:'route',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#101312','line-width':8,'line-opacity':.72}});map.addLayer({id:'route',type:'line',source:'route',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#f2dd4a','line-width':4}})
   });
  });
  return()=>{disposed=true;window.clearTimeout(timeout);abort.abort();markers.forEach(marker=>marker.remove());map?.remove()};
 },[pickupLatitude,pickupLongitude,pickupLabel,destinationLatitude,destinationLongitude,destinationLabel]);
 return <section className="booking-map" aria-label={`Route from ${pickupLabel} to ${destinationLabel}`}><div ref={container}/><div className="booking-map-legend"><span><i className="pickup"/>Pickup</span><span><i className="destination"/>Destination</span></div></section>;
}
