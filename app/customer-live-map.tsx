'use client';
import {useEffect,useRef,useState} from 'react';
import {LngLatBounds,Map as MapLibreMap,Marker,type GeoJSONSource,type StyleSpecification} from 'maplibre-gl';
import {customerRoadRoute} from '@/lib/customer-road-route';

type Coordinate={latitude:number;longitude:number};
type Vehicle=Coordinate&{id:string;recordedAt:string};
type LiveMarker={marker:Marker;position:[number,number];target:[number,number];time:number;heading:number;frame:number|null};
const DEFAULT_CENTER:[number,number]=[-4.143,50.374];
const openStreetMapStyle:StyleSpecification={version:8,sources:{osm:{type:'raster',tiles:['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],tileSize:256,attribution:'© OpenStreetMap contributors'}},layers:[{id:'osm',type:'raster',source:'osm'}]};
function heading(from:[number,number],to:[number,number]){const rad=Math.PI/180,d=(to[0]-from[0])*rad;return Math.atan2(Math.sin(d)*Math.cos(to[1]*rad),Math.cos(from[1]*rad)*Math.sin(to[1]*rad)-Math.sin(from[1]*rad)*Math.cos(to[1]*rad)*Math.cos(d))/rad}
function darkTheme(){return document.documentElement.dataset.theme==='dark'}
function applyMapTheme(map:MapLibreMap){
 const dark=darkTheme();
 if(map.getLayer('osm')){
  map.setPaintProperty('osm','raster-saturation',dark ? -0.72 : 0);
  map.setPaintProperty('osm','raster-contrast',dark ? 0.2 : 0);
  map.setPaintProperty('osm','raster-brightness-min',dark ? 0.04 : 0);
  map.setPaintProperty('osm','raster-brightness-max',dark ? 0.42 : 1);
 }
 if(map.getLayer('customer-route-outline'))map.setPaintProperty('customer-route-outline','line-color',dark?'#050606':'#ffffff');
 if(map.getLayer('customer-route-line'))map.setPaintProperty('customer-route-line','line-color',dark?'#ffffff':'#090a0a');
}
function fitRoute(map:MapLibreMap,coordinates:number[][],duration=0){
 const first=coordinates[0] as [number,number];
 const bounds=coordinates.reduce((value,point)=>value.extend(point as [number,number]),new LngLatBounds(first,first));
 const bottom=window.matchMedia('(max-width:700px)').matches?Math.max(50,Math.round(map.getContainer().clientHeight*.52)):50;
 map.fitBounds(bounds,{padding:{top:125,bottom,left:55,right:55},maxZoom:15,duration});
}
function drawRoute(map:MapLibreMap,coordinates:number[][]){
 const route={type:'Feature' as const,properties:{},geometry:{type:'LineString' as const,coordinates}},source=map.getSource('customer-route') as GeoJSONSource|undefined;
 if(source)source.setData(route);else{map.addSource('customer-route',{type:'geojson',data:route});map.addLayer({id:'customer-route-outline',type:'line',source:'customer-route',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#fff','line-width':10,'line-opacity':.88}});map.addLayer({id:'customer-route-line',type:'line',source:'customer-route',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#090a0a','line-width':6,'line-opacity':1}})}
 applyMapTheme(map);
}

export default function CustomerLiveMap({pickup,destination,picker=false,showRoute=false,cameraTarget,userLocation,onPickerMove,onPickerStart}:{pickup:Coordinate|null;destination?:Coordinate|null;picker?:boolean;showRoute?:boolean;cameraTarget?:Coordinate|null;userLocation?:Coordinate|null;onPickerMove?:(point:Coordinate)=>void;onPickerStart?:()=>void}){
 const container=useRef<HTMLDivElement>(null),mapRef=useRef<MapLibreMap|null>(null),markers=useRef(new Map<string,LiveMarker>()),routeCoordinates=useRef<number[][]|null>(null);
 const callbacks=useRef({picker,onPickerMove,onPickerStart});
 const [vehicles,setVehicles]=useState<Vehicle[]>([]),[live,setLive]=useState(false),[mapError,setMapError]=useState(false);
 const pickupLatitude=pickup?.latitude??null,pickupLongitude=pickup?.longitude??null,destinationLatitude=destination?.latitude??null,destinationLongitude=destination?.longitude??null;
 useEffect(()=>{callbacks.current={picker,onPickerMove,onPickerStart}},[picker,onPickerMove,onPickerStart]);
 useEffect(()=>{
  if(!container.current)return;
  let map:MapLibreMap;
  try{map=new MapLibreMap({container:container.current,style:openStreetMapStyle,center:DEFAULT_CENTER,zoom:13,minZoom:5,maxZoom:19,attributionControl:{compact:true},dragRotate:false,pitchWithRotate:false});}catch{queueMicrotask(()=>setMapError(true));return}
  mapRef.current=map;map.touchZoomRotate.disableRotation();map.touchPitch.disable();
  // Only gestures request a new address. Resizing the sheet and moving the camera
  // to a selected result must never start another reverse-geocoding request.
  let gesture=false;
  map.on('movestart',event=>{if(event.originalEvent){gesture=true;if(callbacks.current.picker)callbacks.current.onPickerStart?.()}});
  map.on('moveend',()=>{if(!gesture)return;gesture=false;if(callbacks.current.picker){const point=map.getCenter();callbacks.current.onPickerMove?.({latitude:point.lat,longitude:point.lng})}});
  let activeStyle='openstreetmap',styleUrls:{lightStyleUrl:string|null;darkStyleUrl:string|null}|null=null;
  const restoreStyle=()=>{if(!map.isStyleLoaded())return;if(routeCoordinates.current)drawRoute(map,routeCoordinates.current);applyMapTheme(map)};
  const syncTheme=()=>{const next=styleUrls?(darkTheme()?styleUrls.darkStyleUrl:styleUrls.lightStyleUrl):null;if(next&&next!==activeStyle){activeStyle=next;map.setStyle(next);map.once('style.load',restoreStyle)}else if(map.isStyleLoaded())restoreStyle()};
  const onLoad=()=>applyMapTheme(map);map.on('load',onLoad);
  fetch('/api/map/config',{cache:'no-store'}).then(async response=>{if(!response.ok)return;const data=await response.json() as {provider?:string;lightStyleUrl?:string|null;darkStyleUrl?:string|null};if(data.provider==='maptiler'&&data.lightStyleUrl&&data.darkStyleUrl){styleUrls={lightStyleUrl:data.lightStyleUrl,darkStyleUrl:data.darkStyleUrl};syncTheme()}}).catch(()=>{});
  const themeObserver=new MutationObserver(syncTheme);themeObserver.observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
  let resizeFrame:number|null=null;
  const observer=new ResizeObserver(()=>{
   if(resizeFrame!==null)cancelAnimationFrame(resizeFrame);
   resizeFrame=requestAnimationFrame(()=>{resizeFrame=null;map.resize()});
  });observer.observe(container.current);
  const cars=markers.current;
  return()=>{observer.disconnect();themeObserver.disconnect();map.off('load',onLoad);if(resizeFrame!==null)cancelAnimationFrame(resizeFrame);cars.forEach(car=>{if(car.frame!==null)cancelAnimationFrame(car.frame);car.marker.remove()});cars.clear();map.remove();mapRef.current=null};
 },[]);
 useEffect(()=>{
  let active=true,receivedStream=false;
  const controller=new AbortController();
  fetch('/api/map/vehicles',{cache:'no-store',signal:controller.signal}).then(async response=>{if(response.ok){const data=await response.json() as Vehicle[];if(active&&!receivedStream)setVehicles(data)}}).catch(()=>{});
  const events=new EventSource('/api/map/vehicles/stream');
  events.addEventListener('connected',()=>{if(active)setLive(true)});
  events.addEventListener('vehicles',((event:MessageEvent<string>)=>{try{const data=JSON.parse(event.data) as Vehicle[];if(active&&Array.isArray(data)){receivedStream=true;setVehicles(data);setLive(true)}}catch{}}) as EventListener);
  events.addEventListener('stream-error',()=>{if(active)setLive(false)});events.onerror=()=>{if(active)setLive(false)};
  return()=>{active=false;controller.abort();events.close()};
 },[]);
 useEffect(()=>{
  const map=mapRef.current;if(!map)return;const cars=markers.current;
  const valid=new Map(vehicles.filter(v=>Number.isFinite(v.latitude)&&Number.isFinite(v.longitude)&&Math.abs(v.latitude)<=90&&Math.abs(v.longitude)<=180).map(v=>[v.id,v]));
  for(const [id,car] of cars)if(!valid.has(id)){if(car.frame!==null)cancelAnimationFrame(car.frame);car.marker.remove();cars.delete(id)}
  for(const vehicle of valid.values()){
   const target:[number,number]=[vehicle.longitude,vehicle.latitude],time=Date.parse(vehicle.recordedAt),car=cars.get(vehicle.id);
   if(!car){const element=document.createElement('div');element.className='customer-geographic-car';const image=document.createElement('img');image.src='/car-marker-live.png';image.alt='Available car';image.draggable=false;element.appendChild(image);cars.set(vehicle.id,{marker:new Marker({element,anchor:'center'}).setLngLat(target).addTo(map),position:target,target,time,heading:0,frame:null});continue}
   // Camera pan/zoom never enters this effect. Only newer GPS samples animate.
   if(time<car.time||(car.target[0]===target[0]&&car.target[1]===target[1]))continue;
   if(car.frame!==null)cancelAnimationFrame(car.frame);
   const from=car.position,start=performance.now(),duration=Math.max(700,Math.min(4200,time-car.time||1200)),fromHeading=car.heading,toHeading=fromHeading+((heading(from,target)-fromHeading+540)%360-180),image=car.marker.getElement().querySelector('img');
   car.target=target;car.time=time;
   const animate=(now:number)=>{const progress=Math.min(1,(now-start)/duration),eased=progress*progress*(3-2*progress);car.position=[from[0]+(target[0]-from[0])*eased,from[1]+(target[1]-from[1])*eased];car.marker.setLngLat(car.position);car.heading=fromHeading+(toHeading-fromHeading)*eased;if(image)image.style.transform=`rotate(${car.heading}deg)`;car.frame=progress<1?requestAnimationFrame(animate):null};
   car.frame=requestAnimationFrame(animate);
  }
 },[vehicles]);
 useEffect(()=>{const map=mapRef.current;if(map&&cameraTarget)map.jumpTo({center:[cameraTarget.longitude,cameraTarget.latitude]})},[cameraTarget]);
 useEffect(()=>{
  const map=mapRef.current;if(!map||!showRoute||pickupLatitude===null||pickupLongitude===null||destinationLatitude===null||destinationLongitude===null)return;
  const controller=new AbortController();let active=true;
  const draw=async()=>{
   const routePickup={latitude:pickupLatitude,longitude:pickupLongitude},routeDestination={latitude:destinationLatitude,longitude:destinationLongitude};
   let coordinates:number[][];try{coordinates=await customerRoadRoute([routePickup,routeDestination],controller.signal)}catch{return}if(!active)return;
   routeCoordinates.current=coordinates;
   if(!map.isStyleLoaded()){map.once('style.load',()=>{if(active){drawRoute(map,coordinates);fitRoute(map,coordinates,500)}});return}drawRoute(map,coordinates);fitRoute(map,coordinates,500);
  };
  if(map.loaded())void draw();else map.once('load',draw);
  return()=>{
   active=false;controller.abort();routeCoordinates.current=null;map.off('load',draw);
   if(map.getLayer('customer-route-line'))map.removeLayer('customer-route-line');
   if(map.getLayer('customer-route-outline'))map.removeLayer('customer-route-outline');
   if(map.getSource('customer-route'))map.removeSource('customer-route');
  };
 },[pickupLatitude,pickupLongitude,destinationLatitude,destinationLongitude,showRoute]);
 useEffect(()=>{
  const map=mapRef.current;if(!map)return;const stops:Marker[]=[];
  const pickupPoint=pickupLatitude===null||pickupLongitude===null?null:{latitude:pickupLatitude,longitude:pickupLongitude},destinationPoint=destinationLatitude===null||destinationLongitude===null?null:{latitude:destinationLatitude,longitude:destinationLongitude};
  if(!picker)for(const [point,label,kind] of [[pickupPoint,'Pick-up','pickup'],[destinationPoint,'Drop-off','destination']] as const){if(!point)continue;const el=document.createElement('div');el.className=`customer-stop-marker ${kind}${showRoute?' route-stop':''}`;el.setAttribute('aria-label',label);if(showRoute){const text=document.createElement('span');text.textContent=label;el.appendChild(text)}stops.push(new Marker({element:el,anchor:'center'}).setLngLat([point.longitude,point.latitude]).addTo(map))}
  if(userLocation){const el=document.createElement('div');el.className='customer-gps-marker';el.setAttribute('aria-label','Your location');stops.push(new Marker({element:el}).setLngLat([userLocation.longitude,userLocation.latitude]).addTo(map))}
  return()=>stops.forEach(marker=>marker.remove());
 },[pickupLatitude,pickupLongitude,destinationLatitude,destinationLongitude,picker,userLocation,showRoute]);
 return <div className="customer-map-canvas"><div ref={container} className="customer-map-engine" aria-label="Interactive map"/>{picker&&<div className="map-picker-pin" aria-hidden="true"><svg width="32" height="42" viewBox="0 0 32 42"><path d="M16 40C13 35 2 23 2 15A14 14 0 0 1 30 15C30 23 19 35 16 40Z" fill="#f2dd4a" stroke="white" strokeWidth="2"/><circle cx="16" cy="15" r="4" fill="#171a19"/></svg></div>}<div className={`customer-map-live ${live?'':'connecting'}`}><span/>{vehicles.length} free car{vehicles.length===1?'':'s'} · {live?'Live':'Connecting'}</div>{mapError&&<p role="alert" className="map-render-error">The map could not start. You can still search for an address below.</p>}</div>;
}
