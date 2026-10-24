export type NavPoint={latitude:number;longitude:number};
export type NavStep={instruction:string;distanceFromStart:number;location:[number,number]};
export type DriverRoute={coordinates:[number,number][];distance:number;duration:number;steps:NavStep[];illustrative?:boolean;pickupDistance?:number;pickupDuration?:number;tripDistance?:number;tripDuration?:number};
export function metresBetween(a:NavPoint,b:NavPoint){const r=Math.PI/180,lat=(b.latitude-a.latitude)*r,lon=(b.longitude-a.longitude)*r;return 6371000*2*Math.asin(Math.min(1,Math.sqrt(Math.sin(lat/2)**2+Math.cos(a.latitude*r)*Math.cos(b.latitude*r)*Math.sin(lon/2)**2)))}
export function maneuverText(type:string,modifier:string|undefined,name:string|undefined){const road=name?` onto ${name}`:'';if(type==='arrive')return 'Your destination is ahead';if(type==='depart')return name?`Head towards ${name}`:'Follow the route';if(type.includes('roundabout')||type==='rotary')return `At the roundabout, follow the highlighted exit${road}`;if(modifier?.includes('left'))return `Turn ${modifier==='slight left'?'slightly ':''}left${road}`;if(modifier?.includes('right'))return `Turn ${modifier==='slight right'?'slightly ':''}right${road}`;if(modifier==='uturn')return 'Make a U-turn when permitted';return name?`Continue on ${name}`:'Continue ahead'}
export function routeProgress(route:DriverRoute,point:NavPoint){
 if(route.coordinates.length<2)return{offRouteMetres:Infinity,remainingMetres:route.distance,remainingSeconds:route.duration,nextInstruction:'Waiting for route',turnMetres:0};
 const scale=111195,cos=Math.cos(point.latitude*Math.PI/180);let best=Infinity,progress=0,total=0;
 for(let i=0;i<route.coordinates.length-1;i++){const a=route.coordinates[i],b=route.coordinates[i+1],ax=(a[0]-point.longitude)*scale*cos,ay=(a[1]-point.latitude)*scale,bx=(b[0]-point.longitude)*scale*cos,by=(b[1]-point.latitude)*scale,dx=bx-ax,dy=by-ay,length=Math.hypot(dx,dy),t=length?Math.max(0,Math.min(1,-(ax*dx+ay*dy)/(length*length))):0,distance=Math.hypot(ax+t*dx,ay+t*dy);if(distance<best){best=distance;progress=total+t*length}total+=length}
 const fraction=total?Math.min(1,progress/total):0,covered=route.distance*fraction;
 const next=route.steps.find(step=>step.distanceFromStart>covered+12)??route.steps[route.steps.length-1];
 return{offRouteMetres:best,remainingMetres:Math.max(0,route.distance-covered),remainingSeconds:Math.max(0,route.duration*(1-fraction)),nextInstruction:next?.instruction??'Continue ahead',turnMetres:Math.max(0,(next?.distanceFromStart??route.distance)-covered)};
}
export function distanceLabel(metres:number){return metres<160?`${Math.round(metres*3.28084/10)*10} ft`:`${(metres/1609.344).toFixed(1)} mi`}
