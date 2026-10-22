'use client';
import {useEffect,useRef,useState} from 'react';
import maplibregl,{LngLatBounds,Map as MapLibreMap,Marker} from 'maplibre-gl';
import {configuredMapStyle} from '@/lib/browser-map-style';

export type Point={latitude:number;longitude:number;label:string};
type BookingMapProps={pickup:Point;destination:Point;routeCoordinates?:number[][]};

export default function BookingMap({pickup,destination,routeCoordinates}:BookingMapProps){
 const [theme,setTheme]=useState<'light'|'dark'>('dark');
 const [error,setError]=useState(false),[revision,setRevision]=useState(0);
 useEffect(()=>{const update=()=>setTheme(document.documentElement.dataset.theme==='light'?'light':'dark');update();const observer=new MutationObserver(update);observer.observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});return()=>observer.disconnect()},[]);
 const container=useRef<HTMLDivElement>(null);
 const pickupLatitude=pickup.latitude,pickupLongitude=pickup.longitude,pickupLabel=pickup.label;
 const destinationLatitude=destination.latitude,destinationLongitude=destination.longitude,destinationLabel=destination.label;
 useEffect(()=>{
  if(!container.current)return;
  const abort=new AbortController();
  const routeAbort=new AbortController();
  const timeout=window.setTimeout(()=>abort.abort(),8000);
  let routeTimeout:number|undefined,resize:ResizeObserver|undefined;
  setError(false);
  const markers:Marker[]=[];let map:MapLibreMap|null=null,disposed=false;
  void configuredMapStyle(theme,abort.signal).then(style=>{if(disposed||!container.current)return;map=new MapLibreMap({container:container.current,style,center:[(pickupLongitude+destinationLongitude)/2,(pickupLatitude+destinationLatitude)/2],zoom:12,attributionControl:{compact:true}});
   map.addControl(new maplibregl.NavigationControl({showCompass:false}),'top-right');
   for(const [point,type] of [[{latitude:pickupLatitude,longitude:pickupLongitude,label:pickupLabel},'pickup'],[{latitude:destinationLatitude,longitude:destinationLongitude,label:destinationLabel},'destination']] as const){const element=document.createElement('div');element.className=`booking-map-marker ${type}`;element.setAttribute('aria-label',point.label);markers.push(new Marker({element}).setLngLat([point.longitude,point.latitude]).setPopup(new maplibregl.Popup({offset:24}).setText(point.label)).addTo(map))}
   const bounds=new LngLatBounds().extend([pickupLongitude,pickupLatitude]).extend([destinationLongitude,destinationLatitude]);const fit=()=>{if(map&&!disposed){map.resize();map.fitBounds(bounds,{padding:window.innerWidth<650?45:70,maxZoom:15,duration:0})}};fit();resize=new ResizeObserver(fit);resize.observe(container.current);
   map.once('load',async()=>{
   let coordinates:number[][]=routeCoordinates||[[pickupLongitude,pickupLatitude],[destinationLongitude,destinationLatitude]];
   routeTimeout=window.setTimeout(()=>routeAbort.abort(),8000);
   if(!routeCoordinates)try{const response=await fetch(`https://router.project-osrm.org/route/v1/driving/${pickupLongitude},${pickupLatitude};${destinationLongitude},${destinationLatitude}?overview=full&geometries=geojson`,{signal:routeAbort.signal});if(response.ok){const result=await response.json() as {routes?:{geometry?:{coordinates?:number[][]}}[]};const routed=result.routes?.[0]?.geometry?.coordinates;if(routed?.length)coordinates=routed}}catch{}
    window.clearTimeout(routeTimeout);if(disposed||!map)return;for(const point of coordinates)bounds.extend([point[0],point[1]]);fit();map.addSource('route',{type:'geojson',data:{type:'Feature',properties:{},geometry:{type:'LineString',coordinates}}});map.addLayer({id:'route-outline',type:'line',source:'route',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#101312','line-width':8,'line-opacity':.72}});map.addLayer({id:'route',type:'line',source:'route',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#f2dd4a','line-width':4}})
   });
  }).catch(()=>{if(!disposed)setError(true)});
  return()=>{disposed=true;window.clearTimeout(timeout);window.clearTimeout(routeTimeout);resize?.disconnect();abort.abort();routeAbort.abort();markers.forEach(marker=>marker.remove());map?.remove()};
 },[pickupLatitude,pickupLongitude,pickupLabel,destinationLatitude,destinationLongitude,destinationLabel,routeCoordinates,theme,revision]);
 return <section className="booking-map" aria-label={`Route from ${pickupLabel} to ${destinationLabel}`}><div ref={container}/>{error&&<button type="button" style={{position:'absolute',inset:24,zIndex:2}} onClick={()=>setRevision(n=>n+1)}>Map unavailable. Tap to retry.</button>}<div className="booking-map-legend"><span><i className="pickup"/>Pickup</span><span><i className="destination"/>Destination</span><span>Route preview</span></div></section>;
}
