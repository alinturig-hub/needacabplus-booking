'use client';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {useCallback,useEffect,useRef,useState} from 'react';
import {ArrowLeft,LogOut,MapPin,RefreshCw} from 'lucide-react';
import maplibregl,{Map as MapLibreMap,Marker,Popup} from 'maplibre-gl';

type Driver={driverId:string;callsign:string|null;name:string|null;phone:string|null;latitude:number;longitude:number;vehicleStatus:string;recordedAt:string};
const rasterStyle={version:8 as const,sources:{osm:{type:'raster' as const,tiles:['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],tileSize:256,attribution:'© OpenStreetMap contributors'}},layers:[{id:'osm',type:'raster' as const,source:'osm'}]};
const DEFAULT_CENTER:[number,number]=[-4.143,50.374];
function timeAgo(iso:string){const s=Math.floor((Date.now()-new Date(iso).getTime())/1000);if(s<60)return `${s}s ago`;if(s<3600)return `${Math.floor(s/60)}m ago`;return `${Math.floor(s/3600)}h ago`;}
function markerLabel(driver:Driver){return(driver.callsign||driver.name||driver.driverId).trim().slice(0,4).toUpperCase();}
function makePopup(driver:Driver):HTMLElement{
 const wrap=document.createElement('div');wrap.className='driver-popup';
 const name=document.createElement('strong');name.textContent=driver.name||driver.callsign||driver.driverId;wrap.appendChild(name);
 if(driver.callsign){const cs=document.createElement('span');cs.textContent=`Callsign: ${driver.callsign}`;wrap.appendChild(cs);}
 if(driver.phone){const ph=document.createElement('span');ph.textContent=`📞 ${driver.phone}`;wrap.appendChild(ph);}
 const st=document.createElement('span');st.className='driver-popup-status';st.textContent=driver.vehicleStatus;wrap.appendChild(st);
 const tm=document.createElement('span');tm.className='driver-popup-time';tm.textContent=timeAgo(driver.recordedAt);wrap.appendChild(tm);
 return wrap;
}
export default function DriverLiveMap(){
 const router=useRouter();
 const mapContainer=useRef<HTMLDivElement>(null);
 const mapRef=useRef<MapLibreMap|null>(null);
 const markersRef=useRef<Map<string,Marker>>(new Map());
 const fittedRef=useRef(false);
 const [drivers,setDrivers]=useState<Driver[]>([]);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState('');
 const [updatedAt,setUpdatedAt]=useState<Date|null>(null);
 const [isLive,setIsLive]=useState(false);
 const fetchDrivers=useCallback(async()=>{
  try{
   const res=await fetch('/api/drivers/live',{credentials:'same-origin',cache:'no-store'});
   if(res.status===401||res.status===403){router.push('/admin-login');return;}
   const data=await res.json() as Driver[];
   setDrivers(data);setUpdatedAt(new Date());setError('');
  }catch{setError('Unable to load driver positions.');}
  finally{setLoading(false);}
 },[router]);
 useEffect(()=>{
  // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional data fetch on mount; setState calls occur only after await
  void fetchDrivers();
 },[fetchDrivers]);
 useEffect(()=>{
  const events=new EventSource('/api/drivers/live/stream',{withCredentials:true});
  const connected=()=>setIsLive(true);
  const update=(event:MessageEvent<string>)=>{try{setDrivers(JSON.parse(event.data) as Driver[]);setUpdatedAt(new Date());setError('');setLoading(false)}catch{setError('Unable to read live driver positions.')}};
  events.addEventListener('connected',connected);events.addEventListener('drivers',update as EventListener);
  events.addEventListener('stream-error',()=>setError('Live driver positions are temporarily unavailable.'));
  events.onerror=()=>setIsLive(false);
  return()=>events.close();
 },[]);
 useEffect(()=>{
  if(!mapContainer.current||mapRef.current)return;
  const markers=markersRef.current;
  const map=new MapLibreMap({container:mapContainer.current,style:rasterStyle,center:DEFAULT_CENTER,zoom:11,attributionControl:{compact:true}});
  map.addControl(new maplibregl.NavigationControl({showCompass:false}),'top-right');
  mapRef.current=map;
  return()=>{markers.forEach(m=>m.remove());markers.clear();map.remove();mapRef.current=null;};
 },[]);
 useEffect(()=>{
  const map=mapRef.current;if(!map)return;
  const existing=markersRef.current;
  const newIds=new Set(drivers.map(d=>d.driverId));
  for(const [id,marker] of existing){if(!newIds.has(id)){marker.remove();existing.delete(id);}}
  const bounds=new maplibregl.LngLatBounds();let hasBounds=false;
  for(const driver of drivers){
   bounds.extend([driver.longitude,driver.latitude]);hasBounds=true;
   if(existing.has(driver.driverId)){
    const marker=existing.get(driver.driverId)!;marker.setLngLat([driver.longitude,driver.latitude]);marker.getPopup()?.setDOMContent(makePopup(driver));
    const label=marker.getElement().querySelector('span');if(label)label.textContent=markerLabel(driver);
   }else{
    const el=document.createElement('div');el.className='driver-map-marker';
    const label=document.createElement('span');label.textContent=markerLabel(driver);el.appendChild(label);
    el.setAttribute('aria-label',driver.name||driver.callsign||driver.driverId);
    const popup=new Popup({offset:28,closeButton:true,closeOnClick:false,className:'driver-popup-wrap'}).setDOMContent(makePopup(driver));
    const marker=new Marker({element:el}).setLngLat([driver.longitude,driver.latitude]).setPopup(popup).addTo(map);
    existing.set(driver.driverId,marker);
   }
  }
  if(!fittedRef.current&&hasBounds){fittedRef.current=true;if(drivers.length===1)map.flyTo({center:[drivers[0].longitude,drivers[0].latitude],zoom:13,duration:800});else map.fitBounds(bounds,{padding:60,maxZoom:14,duration:800})}
 },[drivers]);
 return(
  <main className="admin-shell driver-live-shell">
   <header className="brandbar"><Link className="brand" href="/"><span className="brandmark">N<span>+</span></span><span>NEED A CAB <b>PLUS</b></span></Link>
    <nav className="admin-nav"><Link href="/admin">Bookings</Link><Link href="/admin/drivers">Drivers</Link><Link href="/admin/vehicles">Vehicles</Link><Link className="active" href="/admin/live-map">Clear Map</Link><Link href="/admin/configuration">Configuration</Link></nav>
    <Link className="admin-link" href="/api/admin/logout"><LogOut size={16}/>Sign out</Link>
   </header>
   <div className="driver-live-body">
    <div className="driver-live-bar">
     <MapPin size={17} className="driver-live-icon"/>
     <span className="driver-live-count"><strong>{drivers.length}</strong> CLEAR driver{drivers.length!==1?'s':''}</span><span className={`live-chip map-live-chip ${isLive?'':'connecting'}`}><span/>{isLive?'Live':'Connecting…'}</span>
     {updatedAt&&<span className="driver-live-time">Updated {updatedAt.toLocaleTimeString('en-GB')}</span>}
     <button className="driver-live-refresh" onClick={()=>void fetchDrivers()} disabled={loading} aria-label="Refresh driver positions"><RefreshCw size={14} className={loading?'spin':''}/><span>Refresh</span></button>
     <Link className="driver-live-fleet" href="/admin/drivers"><ArrowLeft size={14}/>Fleet</Link>
    </div>
    {error&&<p className="error-message" style={{margin:'0 42px'}}>{error}</p>}
    <div ref={mapContainer} className="driver-live-canvas"/>
   </div>
  </main>
 );
}
