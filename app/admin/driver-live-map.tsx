'use client';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {ArrowLeft,LogOut,MapPin,Maximize,RefreshCw} from 'lucide-react';
import type {Map as LeafletMap,Marker as LeafletMarker} from 'leaflet';
import {driverMarker,driverPopup} from './driver-map-presentation';
import {cancelDriverMarkerMotion,createDriverMarkerMotion,moveDriverMarker,restoreDriverMarkerHeading,type DriverMarkerMotion} from './driver-marker-motion';

type Driver={id:string;driverId:string|null;callsign:string|null;name:string|null;latitude:number;longitude:number;vehicleStatus:string;operationalStatus:'CLEAR'|'DOW'|'DAP'|'POB'|'OFFLINE'|'UNKNOWN';recordedAt:string;isLive:boolean;registration:string|null;bookingId:number|null;pickupAddress:string|null;destinationAddress:string|null;todayRevenue:number|null};
const DEFAULT_CENTER:[number,number]=[50.374,-4.143];
const coordinate=(driver:Driver)=>[driver.latitude,driver.longitude] as [number,number];
const valid=(driver:Driver)=>Number.isFinite(driver.latitude)&&Number.isFinite(driver.longitude)&&Math.abs(driver.latitude)<=90&&Math.abs(driver.longitude)<=180;
function icon(L:typeof import('leaflet'),driver:Driver){
 return L.divIcon({className:'fleet-vehicle-div-icon',html:driverMarker(driver,driver.id).outerHTML,iconSize:[48,70],iconAnchor:[24,42],popupAnchor:[0,-38]});
}
export default function DriverLiveMap(){
 const router=useRouter();
 const mapContainer=useRef<HTMLDivElement>(null);
 const mapRef=useRef<LeafletMap|null>(null);
 const leafletRef=useRef<typeof import('leaflet')|null>(null);
 const markersRef=useRef<Map<string,LeafletMarker>>(new Map());
 const appearanceRef=useRef(new Map<string,string>());
 const motionRef=useRef(new Map<string,DriverMarkerMotion>());
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
  const active=driver.isLive&&driver.vehicleStatus.trim().toLowerCase()!=='notworking';
  if((filter==='all'||filter==='live')&&!active||filter==='stale'&&driver.isLive)return false;
  if(filter!=='stale'&&filter!=='OFFLINE'&&!driver.isLive)return false;
  if(['CLEAR','DOW','DAP','POB','OFFLINE','UNKNOWN'].includes(filter)&&driver.operationalStatus!==filter)return false;
  const term=query.trim().toLowerCase();
  return !term||[driver.callsign,driver.name,driver.registration,driver.bookingId?.toString()].some(value=>value?.toLowerCase().includes(term));
 }),[drivers,query,filter]);
 const showAll=useCallback(()=>{
  const map=mapRef.current,L=leafletRef.current;
  const points=visibleDrivers.filter(valid);
  if(!map||!L||!points.length)return;
  map.invalidateSize({pan:false});
  if(points.length===1){map.flyTo(coordinate(points[0]),14,{duration:.8});return;}
  map.flyToBounds(L.latLngBounds(points.map(coordinate)),{padding:[40,40],maxZoom:14,duration:.8});
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
  let disposed=false;
  let observer:ResizeObserver|null=null;
  const markers=markersRef.current,appearance=appearanceRef.current,motionStates=motionRef.current;
  void import('leaflet').then(({default:L})=>{
   if(disposed||!mapContainer.current)return;
   leafletRef.current=L;
   const map=L.map(mapContainer.current,{center:DEFAULT_CENTER,zoom:11,scrollWheelZoom:true});
   L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap contributors',maxZoom:19}).addTo(map);
   mapRef.current=map;
   observer=new ResizeObserver(()=>map.invalidateSize({pan:false}));
   observer.observe(mapContainer.current);
   requestAnimationFrame(()=>{if(!disposed)map.invalidateSize({pan:false})});
   setMapReady(true);
  });
  return()=>{disposed=true;observer?.disconnect();markers.clear();appearance.clear();motionStates.forEach(cancelDriverMarkerMotion);motionStates.clear();mapRef.current?.remove();mapRef.current=null;leafletRef.current=null};
 },[]);
 useEffect(()=>{
  const map=mapRef.current,L=leafletRef.current;if(!map||!L||!mapReady)return;
  const existing=markersRef.current;
  const points=visibleDrivers.filter(valid);
  const newIds=new Set(points.map(driver=>driver.id));
  for(const [id,marker] of existing)if(!newIds.has(id)){marker.remove();existing.delete(id);appearanceRef.current.delete(id);const state=motionRef.current.get(id);if(state)cancelDriverMarkerMotion(state);motionRef.current.delete(id)}
  for(const driver of points){
   const signature=`${driver.callsign}|${driver.operationalStatus}|${driver.isLive}`;
   let marker=existing.get(driver.id);
   if(marker){
    if(appearanceRef.current.get(driver.id)!==signature){marker.setIcon(icon(L,driver));restoreDriverMarkerHeading(marker,motionRef.current.get(driver.id)!)}
    moveDriverMarker(marker,motionRef.current.get(driver.id)!,coordinate(driver),driver.recordedAt);
    marker.setPopupContent(driverPopup(driver,driver.id));
   }else{
    marker=L.marker(coordinate(driver),{icon:icon(L,driver),keyboard:true})
     .bindPopup(driverPopup(driver,driver.id),{className:'driver-popup-wrap',maxWidth:410,autoPan:true})
     .addTo(map);
    existing.set(driver.id,marker);
    motionRef.current.set(driver.id,createDriverMarkerMotion(coordinate(driver),driver.recordedAt));
   }
   appearanceRef.current.set(driver.id,signature);
  }
  const selection=`${filter}:${query.trim().toLowerCase()}`;
  if(points.length&&(!fittedRef.current||selectionRef.current!==selection)){
   fittedRef.current=true;selectionRef.current=selection;
   map.invalidateSize({pan:false});
   if(points.length===1)map.setView(coordinate(points[0]),14,{animate:false});
   else map.fitBounds(L.latLngBounds(points.map(coordinate)),{padding:[40,40],maxZoom:14,animate:false});
  }
 },[visibleDrivers,mapReady,filter,query]);

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
