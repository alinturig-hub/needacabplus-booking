import type {Marker} from 'leaflet';

export type DriverMarkerMotion={
 coordinate:[number,number];
 heading:number;
 recordedAt:number;
 frame:number|null;
};

function movementBearing(from:[number,number],to:[number,number]):number{
 const latitude1=from[0]*Math.PI/180;
 const latitude2=to[0]*Math.PI/180;
 const longitudeDelta=(to[1]-from[1])*Math.PI/180;
 const y=Math.sin(longitudeDelta)*Math.cos(latitude2);
 const x=Math.cos(latitude1)*Math.sin(latitude2)-Math.sin(latitude1)*Math.cos(latitude2)*Math.cos(longitudeDelta);
 return(Math.atan2(y,x)*180/Math.PI+360)%360;
}

function nearestHeading(current:number,next:number):number{
 return current+((next-current+540)%360)-180;
}

export function createDriverMarkerMotion(coordinate:[number,number],recordedAt:string):DriverMarkerMotion{
 const timestamp=new Date(recordedAt).getTime();
 return{coordinate,heading:0,recordedAt:Number.isFinite(timestamp)?timestamp:Date.now(),frame:null};
}

export function cancelDriverMarkerMotion(state:DriverMarkerMotion):void{
 if(state.frame!==null){cancelAnimationFrame(state.frame);state.frame=null}
}

export function restoreDriverMarkerHeading(marker:Marker,state:DriverMarkerMotion):void{
 const car=marker.getElement()?.querySelector<HTMLElement>('.driver-map-marker img');
 if(car)car.style.transform=`rotate(${state.heading}deg)`;
}

// Match TaxiCRM's position and bearing animation while keeping the map viewport untouched.
export function moveDriverMarker(marker:Marker,state:DriverMarkerMotion,target:[number,number],recordedAt:string):void{
 const from:[number,number]=[...state.coordinate];
 const nextRecordedAt=new Date(recordedAt).getTime();
 if(Number.isFinite(nextRecordedAt)&&nextRecordedAt<state.recordedAt)return;
 const gap=Number.isFinite(nextRecordedAt)?Math.abs(nextRecordedAt-state.recordedAt):1200;
 state.recordedAt=Number.isFinite(nextRecordedAt)?nextRecordedAt:Date.now();
 const moved=Math.abs(target[0]-from[0])+Math.abs(target[1]-from[1])>0.000001;
 if(!moved){restoreDriverMarkerHeading(marker,state);return}
 cancelDriverMarkerMotion(state);
 const duration=Math.max(800,Math.min(5000,gap*.92||1200));
 const fromHeading=state.heading;
 const toHeading=nearestHeading(fromHeading,movementBearing(from,target));
 const startedAt=performance.now();
 const animate=(now:number)=>{
  const progress=Math.min(1,(now-startedAt)/duration);
  const eased=progress*progress*(3-2*progress);
  state.coordinate=[from[0]+(target[0]-from[0])*eased,from[1]+(target[1]-from[1])*eased];
  marker.setLatLng(state.coordinate);
  state.heading=fromHeading+(toHeading-fromHeading)*eased;
  restoreDriverMarkerHeading(marker,state);
  state.frame=progress<1?requestAnimationFrame(animate):null;
 };
 state.frame=requestAnimationFrame(animate);
}
