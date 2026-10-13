import type {FleetMapVehicle} from '@/lib/taxicrm-fleet-map';

export type DriverMapDetails=Pick<FleetMapVehicle,'callsign'|'name'|'vehicleStatus'|'recordedAt'> & Partial<Pick<FleetMapVehicle,'operationalStatus'|'isLive'|'registration'|'bookingId'|'pickupAddress'|'destinationAddress'|'todayRevenue'>>;

const statusLabels:Record<FleetMapVehicle['operationalStatus'],string>={
 CLEAR:'CLEAR - Available',DOW:'DOW - Driver On The Way',DAP:'DAP - Driver At Pickup',
 POB:'POB - Passenger On Board',OFFLINE:'OFFLINE - Not working',UNKNOWN:'Status unknown',
};

export function driverOperationalStatus(driver:DriverMapDetails):FleetMapVehicle['operationalStatus']{
 if(driver.operationalStatus)return driver.operationalStatus;
 return driver.vehicleStatus.trim().toLowerCase()==='clear'?'CLEAR':'UNKNOWN';
}

export function driverMarkerLabel(driver:DriverMapDetails,fallback:string){
 return(driver.callsign||driver.name||fallback).trim().slice(0,4).toUpperCase();
}

export function driverMarker(driver:DriverMapDetails,fallback:string){
 const element=document.createElement('div');
 element.className=`driver-map-marker driver-map-marker-${driverOperationalStatus(driver).toLowerCase()}${driver.isLive===false?' driver-map-marker-stale':''}`;
 element.setAttribute('role','button');
 element.setAttribute('tabindex','0');
 element.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();element.click()}});
 element.setAttribute('aria-label',`Driver ${driver.callsign||fallback}, ${driver.name||'name unavailable'}, ${statusLabels[driverOperationalStatus(driver)]}`);
 const car=document.createElement('img');car.src='/car-marker-live.png';car.alt='';car.draggable=false;element.appendChild(car);
 const label=document.createElement('span');label.textContent=driverMarkerLabel(driver,fallback);element.appendChild(label);
 return element;
}

export function updateDriverMarker(element:HTMLElement,driver:DriverMapDetails,fallback:string){
 const status=driverOperationalStatus(driver);
 element.className=`driver-map-marker driver-map-marker-${status.toLowerCase()}${driver.isLive===false?' driver-map-marker-stale':''}`;
 element.setAttribute('aria-label',`Driver ${driver.callsign||fallback}, ${driver.name||'name unavailable'}, ${statusLabels[status]}`);
 const label=element.querySelector('span');if(label)label.textContent=driverMarkerLabel(driver,fallback);
}

export function driverPopup(driver:DriverMapDetails,fallback:string):HTMLElement{
 const wrap=document.createElement('div');wrap.className='driver-popup';
 const heading=document.createElement('strong');heading.textContent=`Driver ${driver.callsign||fallback}`;wrap.appendChild(heading);
 const field=(label:string,detail:string)=>{const row=document.createElement('span');const title=document.createElement('b');title.textContent=`${label}: `;row.appendChild(title);row.appendChild(document.createTextNode(detail));wrap.appendChild(row)};
 field('Name',driver.name||'Not available');
 field('Today Revenue',driver.todayRevenue==null?'Not available':new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP'}).format(driver.todayRevenue));
 field('Vehicle',driver.registration||'Not available');
 const status=driverOperationalStatus(driver);field('Status',statusLabels[status]);
 if(status==='DOW'||status==='DAP')field('Pickup',driver.pickupAddress||'Not available');
 if(status==='POB')field('Destination',driver.destinationAddress||'Not available');
 field('Booking',driver.bookingId==null?'None':String(driver.bookingId));
 const elapsed=Date.now()-new Date(driver.recordedAt).getTime();
 const seconds=Number.isFinite(elapsed)?Math.max(0,Math.floor(elapsed/1000)):null;
 field('Last update',seconds===null?'Not available':seconds<60?`${seconds}s ago`:seconds<3600?`${Math.floor(seconds/60)}m ago`:`${Math.floor(seconds/3600)}h ago`);
 field('Connection',driver.isLive===undefined?'Unknown':driver.isLive?'Live':'Stale');
 return wrap;
}
