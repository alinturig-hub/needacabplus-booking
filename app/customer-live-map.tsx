'use client';
/* eslint-disable @next/next/no-img-element -- map tiles and moving vehicle markers are runtime imagery */
import {useEffect,useMemo,useRef,useState} from 'react';

type Vehicle={id:string;label:string;latitude:number;longitude:number;recordedAt:string};
type Point={latitude:number;longitude:number}|null;
type Size={width:number;height:number};
const DEFAULT_CENTER={longitude:-4.143,latitude:50.374},ZOOM=13,TILE=256,WORLD=TILE*2**ZOOM;
function project(latitude:number,longitude:number){const sin=Math.sin(latitude*Math.PI/180);return{x:(longitude+180)/360*WORLD,y:(.5-Math.log((1+sin)/(1-sin))/(4*Math.PI))*WORLD}}

export default function CustomerLiveMap({pickup}:{pickup:Point}){
 const container=useRef<HTMLDivElement>(null),[size,setSize]=useState<Size>({width:0,height:0}),[vehicles,setVehicles]=useState<Vehicle[]>([]),[live,setLive]=useState(false);
 const center=pickup||DEFAULT_CENTER,centerPixel=project(center.latitude,center.longitude);
 useEffect(()=>{const element=container.current;if(!element)return;const update=()=>setSize({width:element.clientWidth,height:element.clientHeight}),observer=new ResizeObserver(update);observer.observe(element);update();return()=>observer.disconnect()},[]);
 useEffect(()=>{let active=true;fetch('/api/map/vehicles',{cache:'no-store'}).then(async response=>{if(response.ok&&active)setVehicles(await response.json() as Vehicle[])}).catch(()=>{});const events=new EventSource('/api/map/vehicles/stream'),update=((event:MessageEvent<string>)=>{try{if(active)setVehicles(JSON.parse(event.data) as Vehicle[])}catch{}}) as EventListener;events.addEventListener('connected',()=>setLive(true));events.addEventListener('vehicles',update);events.onerror=()=>setLive(false);return()=>{active=false;events.close()}},[]);
 const tiles=useMemo(()=>{if(!size.width||!size.height)return[];const firstX=Math.floor((centerPixel.x-size.width/2)/TILE)-1,lastX=Math.floor((centerPixel.x+size.width/2)/TILE)+1,firstY=Math.floor((centerPixel.y-size.height/2)/TILE)-1,lastY=Math.floor((centerPixel.y+size.height/2)/TILE)+1,total=2**ZOOM,list:{key:string;url:string;left:number;top:number}[]=[];for(let y=firstY;y<=lastY;y++)for(let x=firstX;x<=lastX;x++){if(y<0||y>=total)continue;const tileX=((x%total)+total)%total;list.push({key:`${x}-${y}`,url:`https://tile.openstreetmap.org/${ZOOM}/${tileX}/${y}.png`,left:x*TILE-(centerPixel.x-size.width/2),top:y*TILE-(centerPixel.y-size.height/2)})}return list},[centerPixel.x,centerPixel.y,size]);
 const position=(latitude:number,longitude:number)=>{const point=project(latitude,longitude);return{left:point.x-centerPixel.x+size.width/2,top:point.y-centerPixel.y+size.height/2}};
 return <div ref={container} className="customer-map-canvas"><div className="customer-map-tiles">{tiles.map(tile=><img key={tile.key} src={tile.url} alt="" draggable={false} style={{left:tile.left,top:tile.top}}/>)}</div>{vehicles.map(vehicle=>{const point=position(vehicle.latitude,vehicle.longitude);if(point.left< -70||point.left>size.width+70||point.top< -70||point.top>size.height+70)return null;return <div className="customer-car-marker" key={vehicle.id} style={point}><span>{vehicle.label.slice(0,5)}</span><img src="/car-marker-live.png" alt="Available car" draggable={false}/></div>})}{pickup&&<div className="customer-pickup-marker" style={position(pickup.latitude,pickup.longitude)}/>}<div className="customer-map-attribution">© OpenStreetMap contributors</div><div className={`customer-map-live ${live?'':'connecting'}`}><span/>{vehicles.length} free car{vehicles.length===1?'':'s'} · {live?'Live':'Connecting'}</div></div>;
}
