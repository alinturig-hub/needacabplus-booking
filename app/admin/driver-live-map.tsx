'use client';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {ArrowLeft,LogOut,MapPin,Maximize,RefreshCw} from 'lucide-react';
import maplibregl,{Map as MapLibreMap,Marker,Popup} from 'maplibre-gl';
import {configuredMapStyle,openStreetMapStyle} from '@/lib/browser-map-style';
import {driverMarker,driverPopup,updateDriverMarker} from './driver-map-presentation';

type Driver={id:string;driverId:string|null;callsign:string|null;name:string|null;latitude:number;longitude:number;vehicleStatus:string;operationalStatus:'CLEAR'|'DOW'|'DAP'|'POB'|'OFFLINE'|'UNKNOWN';recordedAt:string;isLive:boolean;registration:string|null;bookingId:number|null;pickupAddress:string|null;destinationAddress:string|null;todayRevenue:number|null};
type LiveMarker={marker:Marker;coordinate:[number,number];recordedAt:number;heading:number;animationFrame:number|null};
const DEFAULT_CENTER:[number,number]=[-4.143,50.374];
function bearing(from:[number,number],to:[number,number]){
 const lon1=from[0]*Math.PI/180,lat1=from[1]*Math.PI/180,lon2=to[0]*Math.PI/180,lat2=to[1]*Math.PI/180;
 const y=Math.sin(lon2-lon1)*Math.cos(lat2);
 const x=Math.cos(lat1)*Math.sin(lat2)-Math.sin(lat1)*Math.cos(lat2)*Math.cos(lon2-lon1);
 return(Math.atan2(y,x)*180/Math.PI+360)%360;
}
function nearestHeading(current:number,next:number){return current+((next-current+540)%360-180);}
export default function DriverLiveMap(){
 const router=useRouter();
 const mapContainer=useRef<HTMLDivElement>(null);
 const mapRef=useRef<MapLibreMap|null>(null);
 const markersRef=useRef<Map<string,LiveMarker>>(new Map());
 const fittedRef=useRef(false);
 const selectionRef=useRef('all:');
 const [mapReady,setMapReady]=useState(false);
 const [drivers,setDrivers]=useState<Driver[]>([]);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState('');
 const [updatedAt,setUpdatedAt]=useState<Date|null>(null);
 const [isLive,setIsLive]=useState(false);
 const [query,setQuery]=useState('');
 const [filter,setFilter]=useState('all');
 const visibleDrivers=useMemo(()=>drivers.filter(driver=>{
  if(filter==='live'&&!driver.isLive||filter==='stale'&&driver.isLive)return false;
  if(['CLEAR','DOW','DAP','POB','OFFLINE','UNKNOWN'].includes(filter)&&driver.operationalStatus!==filter)return false;
  const term=query.trim().toLowerCase();
  return !term||[driver.callsign,driver.name,driver.registration,driver.bookingId?.toString()].some(value=>value?.toLowerCase().includes(term));
 }),[drivers,query,filter]);
 const showAll=useCallback(()=>{
  const map=mapRef.current;if(!map||!visibleDrivers.length)return;
  if(visibleDrivers.length===1){map.flyTo({center:[visibleDrivers[0].longitude,visibleDrivers[0].latitude],zoom:14,duration:800});return;}
  const bounds=new maplibregl.LngLatBounds();
  for(const driver of visibleDrivers)bounds.extend([driver.longitude,driver.latitude]);
  map.fitBounds(bounds,{padding:80,maxZoom:14,duration:800});
 },[visibleDrivers]);
 const fetchDrivers=useCallback(async()=>{
  try{
   const res=await fetch('/api/drivers/live',{credentials:'same-origin',cache:'no-store'});
   if(res.status===401||res.status===403){router.push('/dispatch/login');return;}
   const data=await res.json() as Driver[];
   if(!res.ok||!Array.isArray(data))throw new Error('Driver feed unavailable');
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
  const markers=markersRef.current,controller=new AbortController();let map:MapLibreMap|null=null,disposed=false;
  void configuredMapStyle('dark',controller.signal).then(style=>{if(disposed||!mapContainer.current)return;map=new MapLibreMap({container:mapContainer.current,style:style||openStreetMapStyle,center:DEFAULT_CENTER,zoom:11,attributionControl:{compact:true}});map.addControl(new maplibregl.NavigationControl({showCompass:false}),'top-right');mapRef.current=map;setMapReady(true)});
  return()=>{disposed=true;controller.abort();markers.forEach(({marker,animationFrame})=>{if(animationFrame!==null)cancelAnimationFrame(animationFrame);marker.remove()});markers.clear();map?.remove();mapRef.current=null;};
 },[]);
 useEffect(()=>{
  const map=mapRef.current;if(!map||!mapReady)return;
  const existing=markersRef.current;
  const newIds=new Set(visibleDrivers.map(d=>d.id));
  for(const [id,state] of existing){if(!newIds.has(id)){if(state.animationFrame!==null)cancelAnimationFrame(state.animationFrame);state.marker.remove();existing.delete(id);}}
  for(const driver of visibleDrivers){
   if(existing.has(driver.id)){
    const state=existing.get(driver.id)!;
    state.marker.getPopup()?.setDOMContent(driverPopup(driver,driver.id));
    updateDriverMarker(state.marker.getElement(),driver,driver.id);
    const target:[number,number]=[driver.longitude,driver.latitude];
    const from:[number,number]=[state.coordinate[0],state.coordinate[1]];
    const moved=Math.abs(target[0]-from[0])+Math.abs(target[1]-from[1])>0.000001;
    if(moved){
     if(state.animationFrame!==null)cancelAnimationFrame(state.animationFrame);
     const nextRecordedAt=new Date(driver.recordedAt).getTime();
     const gap=Number.isFinite(nextRecordedAt)&&state.recordedAt>0?Math.abs(nextRecordedAt-state.recordedAt):1200;
     const duration=Math.max(800,Math.min(5000,gap*.92||1200));
     const fromHeading=state.heading;
     const toHeading=nearestHeading(fromHeading,bearing(from,target));
     const car=state.marker.getElement().querySelector('img');
     const started=performance.now();
     const animate=(now:number)=>{
      const progress=Math.min(1,(now-started)/duration);
      const eased=progress*progress*(3-2*progress);
      state.coordinate=[from[0]+(target[0]-from[0])*eased,from[1]+(target[1]-from[1])*eased];
      state.marker.setLngLat(state.coordinate);
      state.heading=fromHeading+(toHeading-fromHeading)*eased;
      if(car)car.setAttribute('style',`transform:rotate(${state.heading}deg)`);
      state.animationFrame=progress<1?requestAnimationFrame(animate):null;
     };
     state.animationFrame=requestAnimationFrame(animate);
     state.recordedAt=Number.isFinite(nextRecordedAt)?nextRecordedAt:Date.now();
    }
   }else{
    const el=driverMarker(driver,driver.id);
    const popup=new Popup({offset:28,closeButton:true,closeOnClick:false,className:'driver-popup-wrap',maxWidth:'min(410px, calc(100vw - 32px))'}).setDOMContent(driverPopup(driver,driver.id));
    const marker=new Marker({element:el}).setLngLat([driver.longitude,driver.latitude]).setPopup(popup).addTo(map);
    const recordedAt=new Date(driver.recordedAt).getTime();
    existing.set(driver.id,{marker,coordinate:[driver.longitude,driver.latitude],recordedAt:Number.isFinite(recordedAt)?recordedAt:Date.now(),heading:0,animationFrame:null});
   }
  }
  const selection=`${filter}:${query.trim().toLowerCase()}`;
  if(visibleDrivers.length&&(!fittedRef.current||selectionRef.current!==selection)){
   fittedRef.current=true;selectionRef.current=selection;showAll();
  }
 },[visibleDrivers,mapReady,filter,query,showAll]);
 return(
  <main className="admin-shell driver-live-shell premium-admin">
   <header className="brandbar"><Link className="brand" href="/dispatch"><span className="brandmark">N<span>+</span></span><span className="admin-brand-copy">NEED A CAB <b>PLUS</b><small>Dispatch</small></span></Link>
    <nav className="admin-nav"><Link href="/dispatch">Dispatcher</Link><Link href="/dispatch/bookings">Search bookings</Link><Link href="/dispatch/analysis">Dispatch analysis</Link><Link className="active" href="/dispatch/map">Live map</Link></nav>
    <Link prefetch={false} className="admin-link" href="/api/admin/logout"><LogOut size={16}/>Sign out</Link>
   </header>
   <div className="driver-live-body">
    <div className="driver-live-bar">
     <MapPin size={17} className="driver-live-icon"/>
     <span className="driver-live-count"><strong>{visibleDrivers.length}</strong> of {drivers.length} vehicles</span><span className={`live-chip map-live-chip ${isLive?'':'connecting'}`}><span/>{isLive?'Live':'Connecting…'}</span>
     {updatedAt&&<span className="driver-live-time">Updated {updatedAt.toLocaleTimeString('en-GB')}</span>}
     <button className="driver-live-refresh" onClick={showAll} disabled={!mapReady||!visibleDrivers.length} aria-label="Show all vehicles on map"><Maximize size={14}/><span>Show all</span></button>
     <button className="driver-live-refresh" onClick={()=>void fetchDrivers()} disabled={loading} aria-label="Refresh driver positions"><RefreshCw size={14} className={loading?'spin':''}/><span>Refresh</span></button>
     <Link className="driver-live-fleet" href="/dispatch"><ArrowLeft size={14}/>Dispatcher</Link>
    </div>
    <div className="driver-live-filters"><input aria-label="Search driver, callsign, vehicle or booking" placeholder="Search driver, callsign, vehicle or booking…" value={query} onChange={event=>setQuery(event.target.value)}/><select aria-label="Filter vehicles" value={filter} onChange={event=>setFilter(event.target.value)}><option value="all">All vehicles</option><option value="CLEAR">Available</option><option value="DOW">On the way</option><option value="DAP">At pickup</option><option value="POB">Passenger on board</option><option value="OFFLINE">Not working</option><option value="UNKNOWN">Unknown status</option><option value="live">Live connection</option><option value="stale">Stale connection</option></select></div>
    {error&&<p className="error-message" style={{margin:'0 42px'}}>{error}</p>}
    <div ref={mapContainer} className="driver-live-canvas"/>
   </div>
  </main>
 );
}
