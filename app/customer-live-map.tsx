'use client';
import {useEffect,useRef,useState} from 'react';
import {Map as MapLibreMap,Marker} from 'maplibre-gl';

type Vehicle={id:string;label:string;latitude:number;longitude:number;recordedAt:string};
type LiveMarker={marker:Marker;coordinate:[number,number];heading:number;frame:number|null};
type Point={latitude:number;longitude:number}|null;
const style={version:8 as const,sources:{osm:{type:'raster' as const,tiles:['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],tileSize:256,attribution:'© OpenStreetMap contributors'}},layers:[{id:'osm',type:'raster' as const,source:'osm',paint:{'raster-saturation':-0.72,'raster-brightness-max':0.7,'raster-contrast':0.12}}]};
const CENTER:[number,number]=[-4.143,50.374];
function bearing(from:[number,number],to:[number,number]){const lon1=from[0]*Math.PI/180,lat1=from[1]*Math.PI/180,lon2=to[0]*Math.PI/180,lat2=to[1]*Math.PI/180,y=Math.sin(lon2-lon1)*Math.cos(lat2),x=Math.cos(lat1)*Math.sin(lat2)-Math.sin(lat1)*Math.cos(lat2)*Math.cos(lon2-lon1);return(Math.atan2(y,x)*180/Math.PI+360)%360}
function nearest(current:number,next:number){return current+((next-current+540)%360-180)}

export default function CustomerLiveMap({pickup}:{pickup:Point}){
 const container=useRef<HTMLDivElement>(null),mapRef=useRef<MapLibreMap|null>(null),markers=useRef<Map<string,LiveMarker>>(new Map()),pickupMarker=useRef<Marker|null>(null);
 const [vehicles,setVehicles]=useState<Vehicle[]>([]),[live,setLive]=useState(false);
 useEffect(()=>{
  if(!container.current||mapRef.current)return;
  const currentMarkers=markers.current,map=new MapLibreMap({container:container.current,style,center:CENTER,zoom:12,attributionControl:{compact:true}});mapRef.current=map;
  return()=>{currentMarkers.forEach(item=>{if(item.frame!==null)cancelAnimationFrame(item.frame);item.marker.remove()});currentMarkers.clear();pickupMarker.current?.remove();map.remove();mapRef.current=null};
 },[]);
 useEffect(()=>{
  let active=true;fetch('/api/map/vehicles',{cache:'no-store'}).then(async response=>{if(response.ok&&active)setVehicles(await response.json() as Vehicle[])}).catch(()=>{});
  const events=new EventSource('/api/map/vehicles/stream');events.addEventListener('connected',()=>setLive(true));const update=((event:MessageEvent<string>)=>{try{if(active)setVehicles(JSON.parse(event.data) as Vehicle[])}catch{}}) as EventListener;events.addEventListener('vehicles',update);events.onerror=()=>setLive(false);
  return()=>{active=false;events.close()};
 },[]);
 useEffect(()=>{
  const map=mapRef.current;if(!map)return;const current=markers.current,ids=new Set(vehicles.map(vehicle=>vehicle.id));
  current.forEach((state,id)=>{if(!ids.has(id)){if(state.frame!==null)cancelAnimationFrame(state.frame);state.marker.remove();current.delete(id)}});
  vehicles.forEach(vehicle=>{
   const target:[number,number]=[vehicle.longitude,vehicle.latitude],existing=current.get(vehicle.id);
   if(!existing){const element=document.createElement('div');element.className='customer-car-marker';const label=document.createElement('span');label.textContent=vehicle.label.slice(0,5);const car=document.createElement('img');car.src='/car-marker-live.png';car.alt='Available car';car.draggable=false;element.appendChild(label);element.appendChild(car);const marker=new Marker({element}).setLngLat(target).addTo(map);current.set(vehicle.id,{marker,coordinate:target,heading:0,frame:null});return}
   const label=existing.marker.getElement().querySelector('span');if(label)label.textContent=vehicle.label.slice(0,5);const from:[number,number]=[...existing.coordinate];if(Math.abs(target[0]-from[0])+Math.abs(target[1]-from[1])<0.000001)return;
   if(existing.frame!==null)cancelAnimationFrame(existing.frame);const start=performance.now(),fromHeading=existing.heading,toHeading=nearest(fromHeading,bearing(from,target)),image=existing.marker.getElement().querySelector('img');
   const animate=(now:number)=>{const progress=Math.min(1,(now-start)/4200),eased=progress*progress*(3-2*progress);existing.coordinate=[from[0]+(target[0]-from[0])*eased,from[1]+(target[1]-from[1])*eased];existing.marker.setLngLat(existing.coordinate);existing.heading=fromHeading+(toHeading-fromHeading)*eased;if(image)image.style.transform=`rotate(${existing.heading}deg)`;existing.frame=progress<1?requestAnimationFrame(animate):null};existing.frame=requestAnimationFrame(animate);
  });
 },[vehicles]);
 useEffect(()=>{
  const map=mapRef.current;if(!map||!pickup)return;pickupMarker.current?.remove();const element=document.createElement('div');element.className='customer-pickup-marker';pickupMarker.current=new Marker({element,anchor:'center'}).setLngLat([pickup.longitude,pickup.latitude]).addTo(map);map.flyTo({center:[pickup.longitude,pickup.latitude],zoom:14,duration:700});
 },[pickup]);
 return <><div ref={container} className="customer-map-canvas"/><div className={`customer-map-live ${live?'':'connecting'}`}><span/>{vehicles.length} free car{vehicles.length===1?'':'s'} · {live?'Live':'Connecting'}</div></>;
}
