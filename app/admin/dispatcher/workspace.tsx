'use client';

import {useEffect,useMemo,useState} from 'react';
import Link from 'next/link';
import {Activity,CarFront,Clock3,LogOut,MapPin,Plus,RefreshCw,Search,Settings2,X} from 'lucide-react';
import styles from './workspace.module.css';
import DispatcherDriverMap,{type MapDriver} from './driver-map';

type Job={id:string;reference:string;pickup:string;destination:string;pickup_zone?:string|null;status:string;due_at:string|null;vehicle:string|null;assigned:boolean};
type Driver=MapDriver;
type Zone={externalId:string;name:string;descriptor:string|null;latitude:number|null;longitude:number|null};
type DispatchData={jobs:Job[];activeTotal:number;serverTime:string;dataSource?:string;fleet:{clear:number}};
const waiting=(job:Job)=>!job.assigned&&['Booked','Created','Modified','Running Late'].includes(job.status);
const ukTime=(value:string|null)=>value?new Date(value).toLocaleString('en-GB',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit',timeZone:'Europe/London'}):'—';
const zoneName=(value:string|null|undefined)=>value?.trim()||'Zone unavailable';
const isClear=(driver:Driver)=>driver.vehicleStatus.trim().toLowerCase()==='clear';

export default function DispatcherWorkspace(){
 const [data,setData]=useState<DispatchData|null>(null);
 const [drivers,setDrivers]=useState<Driver[]>([]);
 const [knownZones,setKnownZones]=useState<Zone[]>([]);
 const [error,setError]=useState('');
 const [fleetError,setFleetError]=useState('');
 const [zoneError,setZoneError]=useState(false);
 const [updatedAt,setUpdatedAt]=useState('');
 const [refreshKey,setRefreshKey]=useState(0);
 const [query,setQuery]=useState('');
 const [tab,setTab]=useState<'waiting'|'active'|'done'>('waiting');
 const [selectedZone,setSelectedZone]=useState('');
 const [selectedBooking,setSelectedBooking]=useState('');
 const [selectedDriver,setSelectedDriver]=useState('');
 const [bookingOpen,setBookingOpen]=useState(false);
 const [pickupTime,setPickupTime]=useState('');
 const [asap,setAsap]=useState(true);
 const [pickup,setPickup]=useState('');
 const [destination,setDestination]=useState('');
 const [name,setName]=useState('');
 const [phone,setPhone]=useState('');
 const [passengers,setPassengers]=useState('1');
 const [payment,setPayment]=useState('Cash');
 const [note,setNote]=useState('');

 useEffect(()=>{
  let active=true;
  let timer:ReturnType<typeof setTimeout>;
  const load=async()=>{
   if(!document.hidden){
    const [jobsResult,driversResult]=await Promise.allSettled([
     fetch('/api/admin/dispatch-live',{cache:'no-store'}).then(async response=>{const value=await response.json() as DispatchData&{error?:string};if(!response.ok)throw new Error(value.error||'Booking feed unavailable');return value}),
     fetch('/api/admin/taxicrm-database?fleet=1',{cache:'no-store'}).then(async response=>{const value=await response.json() as {drivers:Driver[];zones:Zone[];zoneError?:boolean;error?:string};if(!response.ok)throw new Error(value.error||'Fleet feed unavailable');return value}),
    ]);
    if(!active)return;
    if(jobsResult.status==='fulfilled'){setData(jobsResult.value);setError('');setUpdatedAt(new Date().toISOString())}
    else setError(jobsResult.reason instanceof Error?jobsResult.reason.message:'Booking feed unavailable');
    if(driversResult.status==='fulfilled'){setDrivers(driversResult.value.drivers);setKnownZones(driversResult.value.zones);setZoneError(Boolean(driversResult.value.zoneError));setFleetError('')}
    else setFleetError(driversResult.reason instanceof Error?driversResult.reason.message:'Fleet feed unavailable');
   }
   if(active)timer=setTimeout(load,5000);
  };
  void load();
  return()=>{active=false;clearTimeout(timer)};
 },[refreshKey]);

 const jobs=useMemo(()=>data?.jobs||[],[data]);
 const waitingJobs=jobs.filter(waiting);
 const activeJobs=jobs.filter(job=>!waiting(job));
 const availableCount=drivers.filter(isClear).length;
 const visibleDrivers=[...drivers].sort((a,b)=>Number(isClear(b))-Number(isClear(a))||(a.vehicleCallsign||a.callsign||'').localeCompare(b.vehicleCallsign||b.callsign||''));
 const focusedDriver=drivers.find(driver=>driver.vehicleId===selectedDriver);
 const zones=useMemo(()=>{
  const groups=new Map<string,{drivers:Driver[];waiting:number;clear:number;busy:number}>();
  for(const zone of knownZones)groups.set(zone.name,{drivers:[],waiting:0,clear:0,busy:0});
  for(const driver of drivers){const zone=zoneName(driver.zone);const group=groups.get(zone)||{drivers:[],waiting:0,clear:0,busy:0};group.drivers.push(driver);if(isClear(driver))group.clear++;else group.busy++;groups.set(zone,group)}
  for(const job of waitingJobs){const zone=zoneName(job.pickup_zone);const group=groups.get(zone)||{drivers:[],waiting:0,clear:0,busy:0};group.waiting++;groups.set(zone,group)}
  return [...groups].sort((a,b)=>a[0]==='Zone unavailable'?1:b[0]==='Zone unavailable'?-1:a[0].localeCompare(b[0]));
 },[drivers,knownZones,waitingJobs]);
 const visibleJobs=(tab==='waiting'?waitingJobs:tab==='active'?activeJobs:[]).filter(job=>
  (!selectedZone||zoneName(job.pickup_zone)===selectedZone)&&`${job.reference} ${job.pickup} ${job.destination} ${job.status}`.toLowerCase().includes(query.toLowerCase())
 );
 const selected=jobs.find(job=>job.id===selectedBooking);
 const stale=!updatedAt||Boolean(error)||Boolean(fleetError);

 return <div className={`${styles.page} premium-admin`}>
  <header className="brandbar"><Link className="brand" href="/admin"><span className="brandmark">N<span>+</span></span><span className="admin-brand-copy">NEED A CAB <b>PLUS</b><small>Dispatcher</small></span></Link><nav className="admin-nav" aria-label="Admin navigation"><Link href="/admin">Overview</Link><Link href="/admin/bookings">Search bookings</Link><Link className="active" href="/admin/dispatcher" aria-current="page">Dispatcher</Link><Link href="/admin/dispatch">Dispatch analysis</Link><Link href="/admin/live-map">Live map</Link><Link href="/admin/configuration"><Settings2 size={15}/>Settings</Link></nav><Link prefetch={false} className="admin-link" href="/api/admin/logout"><LogOut size={16}/>Sign out</Link></header>
  <main className={styles.main}>
   <div className={styles.heading}><div><small>OPERATIONS · TAXICRM</small><h1>Dispatcher workspace</h1><p>Tracked drivers, zones and bookings update every five seconds.</p></div><div className={styles.headingActions}><span className={stale?styles.delayed:styles.live}>{stale?'Updates delayed':'Live from TaxiCRM'}</span><button type="button" className={styles.newBookingButton} onClick={()=>setBookingOpen(true)}><Plus size={17}/>New booking</button><button type="button" aria-label="Refresh dispatcher" onClick={()=>setRefreshKey(value=>value+1)}><RefreshCw size={17}/></button></div></div>
   {(error||fleetError||zoneError)&&<p className={styles.alert} role="alert">{error||fleetError||(zoneError?'TaxiCRM zones are temporarily unavailable':'')}. {error||fleetError?'Last loaded data may be out of date.':'Driver positions remain visible.'}</p>}
   <div className={styles.summary}><span><Clock3 size={17}/>To dispatch <strong>{waitingJobs.length}</strong></span><span><Activity size={17}/>Active <strong>{activeJobs.length}</strong></span><span><CarFront size={17}/>Available cars <strong>{availableCount}</strong></span><span><MapPin size={17}/>Tracked vehicles <strong>{drivers.length}</strong></span><span>Last update <strong>{ukTime(updatedAt||null)}</strong></span></div>
   <div className={styles.upper}>
    {bookingOpen&&<div className={styles.formBackdrop} onMouseDown={event=>{if(event.target===event.currentTarget)setBookingOpen(false)}}><section className={styles.bookingForm} role="dialog" aria-modal="true" aria-labelledby="new-booking-title"><div className={styles.panelHeading}><div><small>OPERATOR</small><h2 id="new-booking-title">New booking</h2></div><button type="button" className={styles.closeForm} aria-label="Close new booking" onClick={()=>setBookingOpen(false)}><X size={20}/></button></div><p className={styles.help}>Prepare a manual booking. TaxiCRM creation will be enabled when its operator API is connected.</p>
     <div className={styles.formScroll}>
      <div className={styles.timeRow}><button type="button" className={asap?styles.selectedButton:''} onClick={()=>setAsap(true)}>ASAP</button><button type="button" className={!asap?styles.selectedButton:''} onClick={()=>setAsap(false)}>Schedule</button>{!asap&&<input aria-label="Pickup time" type="datetime-local" value={pickupTime} onChange={event=>setPickupTime(event.target.value)}/>}</div>
      <label>Pickup address<input value={pickup} onChange={event=>setPickup(event.target.value)} placeholder="Where is the passenger?" autoComplete="off"/></label>
      <label>Destination<input value={destination} onChange={event=>setDestination(event.target.value)} placeholder="Where are they going?" autoComplete="off"/></label>
      <details><summary>Add via point</summary><label>Via address<input placeholder="Intermediate stop" autoComplete="off"/></label></details>
      <div className={styles.twoFields}><label>Passenger name<input value={name} onChange={event=>setName(event.target.value)} placeholder="Name" autoComplete="name"/></label><label>Telephone<input value={phone} onChange={event=>setPhone(event.target.value)} placeholder="Phone" autoComplete="tel"/></label></div>
      <div className={styles.twoFields}><label>Passengers<input type="number" min="1" max="20" value={passengers} onChange={event=>setPassengers(event.target.value)}/></label><label>Payment<select value={payment} onChange={event=>setPayment(event.target.value)}><option>Cash</option><option>Card</option><option>Account</option></select></label></div>
      <details><summary>More booking details</summary><div className={styles.twoFields}><label>Booking source<input placeholder="OperatorWeb"/></label><label>Our reference<input placeholder="Optional"/></label></div><div className={styles.twoFields}><label>Requested driver<input placeholder="Callsign"/></label><label>Requested vehicle<input placeholder="Callsign"/></label></div><div className={styles.twoFields}><label>Driver fare · cost<input type="number" min="0" step="0.01" placeholder="£"/></label><label>Office fare · price<input type="number" min="0" step="0.01" placeholder="£"/></label></div></details>
      <label>Office note<textarea value={note} onChange={event=>setNote(event.target.value)} rows={2} placeholder="Information for the operator"/></label>
     </div><div className={styles.formActions}><span>Booking creation is awaiting the TaxiCRM operator API.</span><button type="button" disabled title="TaxiCRM operator booking API is not connected">Create booking</button></div>
    </section></div>}
    <section className={styles.fleet} aria-labelledby="fleet-title"><div className={styles.panelHeading}><div><small>FLEET · TAXICRM</small><h2 id="fleet-title">Tracked drivers</h2></div><span>{visibleDrivers.length}</span></div><div className={styles.driverList}>{visibleDrivers.map(driver=><button type="button" key={driver.vehicleId} className={selectedDriver===driver.vehicleId?styles.activeDriver:''} onClick={()=>setSelectedDriver(driver.vehicleId)}><strong>{driver.vehicleCallsign||driver.callsign||driver.vehicleId}</strong><span>{driver.name||'Driver name unavailable'}</span><small>{zoneName(driver.zone)}</small><em className={isClear(driver)?styles.clearStatus:styles.busyStatus}>{driver.vehicleStatus}</em></button>)}{drivers.length===0&&<p className={styles.empty}>No recent vehicle positions received.</p>}</div></section>
    <section className={styles.mapPanel} aria-labelledby="map-title"><div className={styles.panelHeading}><div><small>LIVE POSITIONS</small><h2 id="map-title">Driver map</h2></div><span>{selectedZone||'All zones'}</span></div><DispatcherDriverMap drivers={drivers} zones={knownZones} selectedZone={selectedZone} selectedDriver={selectedDriver} onSelect={setSelectedDriver}/><div className={styles.mapFooter}><span><i className={styles.clearDot}/>Clear {availableCount}</span><span><i className={styles.busyDot}/>Other statuses {drivers.length-availableCount}</span>{focusedDriver&&<strong>{focusedDriver.vehicleCallsign||focusedDriver.callsign||focusedDriver.vehicleId} · {focusedDriver.name||focusedDriver.vehicleStatus}</strong>}</div></section>
    <section className={styles.zones} aria-labelledby="zones-title"><div className={styles.panelHeading}><div><small>TAXICRM ZONES</small><h2 id="zones-title">Pickup zones</h2></div><span>{knownZones.length} zones</span></div><div className={styles.zoneList}><button type="button" className={!selectedZone?styles.activeZone:''} onClick={()=>setSelectedZone('')}><strong>All zones</strong><span>{waitingJobs.length} waiting bookings</span><small>Show all tracked drivers on the map</small></button>{zones.filter(([zone])=>zone!=='Zone unavailable').map(([zone,group])=><button type="button" key={zone} className={selectedZone===zone?styles.activeZone:''} onClick={()=>setSelectedZone(zone)}><strong>{zone}</strong><span>{group.waiting} waiting</span><small>{group.drivers.length?`${group.clear} clear · ${group.busy} other with known zone`:'Driver zone unavailable in live feed'}</small></button>)}{!zones.length&&<p className={styles.empty}>Waiting for TaxiCRM zones.</p>}</div></section>
   </div>
   <section className={styles.queue} aria-label="Bookings queue"><div className={styles.queueHeading}><div className={styles.tabs}><button type="button" aria-pressed={tab==='waiting'} onClick={()=>setTab('waiting')}>To dispatch <b>{waitingJobs.length}</b></button><button type="button" aria-pressed={tab==='active'} onClick={()=>setTab('active')}>In progress <b>{activeJobs.length}</b></button><button type="button" aria-pressed={tab==='done'} onClick={()=>setTab('done')}>Completed</button></div><label className={styles.search}><Search size={17}/><input aria-label="Search dispatch bookings" value={query} onChange={event=>setQuery(event.target.value)} placeholder="Booking ID, address or status"/></label></div><div className={styles.tableWrap}><table><thead><tr><th>Pickup time</th><th>Zone</th><th>Booking ID</th><th>Pickup</th><th>Destination</th><th>Status</th><th>Vehicle</th></tr></thead><tbody>{visibleJobs.map(job=><tr key={job.id} onClick={()=>setSelectedBooking(job.id)} className={selectedBooking===job.id?styles.activeRow:''}><td>{ukTime(job.due_at)}</td><td>{zoneName(job.pickup_zone)}</td><td><strong>{job.reference}</strong></td><td>{job.pickup}</td><td>{job.destination}</td><td>{job.status}</td><td>{job.vehicle||'—'}</td></tr>)}{visibleJobs.length===0&&<tr><td colSpan={7} className={styles.empty}>{tab==='done'?'Completed bookings are available in Search bookings.':data?'No bookings match these filters.':'Connecting to TaxiCRM…'}</td></tr>}</tbody></table></div><footer>{data?.dataSource==='taxicrm'?'TaxiCRM booking data':'Live dispatch feed'} · {visibleJobs.length} shown of {data?.activeTotal??0} active bookings</footer></section>
   {selected&&<aside className={styles.selection} aria-label="Selected booking"><div><strong>Booking #{selected.reference}</strong><span>{selected.status} · {ukTime(selected.due_at)} · {zoneName(selected.pickup_zone)}</span><p>{selected.pickup} → {selected.destination}</p></div><button type="button" onClick={()=>setSelectedBooking('')}>Close</button></aside>}
  </main>
 </div>;
}
