export type NavPoint={latitude:number;longitude:number};
export type NavStep={instruction:string;distanceFromStart:number;location:[number,number]};
export type DriverRoute={coordinates:[number,number][];distance:number;duration:number;steps:NavStep[];segmentDistances?:number[];segmentDurations?:number[];illustrative?:boolean;pickupDistance?:number;pickupDuration?:number;tripDistance?:number;tripDuration?:number};
export function metresBetween(a:NavPoint,b:NavPoint){const r=Math.PI/180,lat=(b.latitude-a.latitude)*r,lon=(b.longitude-a.longitude)*r;return 6371000*2*Math.asin(Math.min(1,Math.sqrt(Math.sin(lat/2)**2+Math.cos(a.latitude*r)*Math.cos(b.latitude*r)*Math.sin(lon/2)**2)))}
export function maneuverText(type:string,modifier:string|undefined,name:string|undefined){const road=name?` onto ${name}`:'';if(type==='arrive')return 'Your destination is ahead';if(type==='depart')return name?`Head towards ${name}`:'Follow the route';if(type.includes('roundabout')||type==='rotary')return `At the roundabout, follow the highlighted exit${road}`;if(modifier?.includes('left'))return `Turn ${modifier==='slight left'?'slightly ':''}left${road}`;if(modifier?.includes('right'))return `Turn ${modifier==='slight right'?'slightly ':''}right${road}`;if(modifier==='uturn')return 'Make a U-turn when permitted';return name?`Continue on ${name}`:'Continue ahead'}
export function bearingBetween(a:NavPoint,b:NavPoint){const r=Math.PI/180,p=a.latitude*r,q=b.latitude*r,d=(b.longitude-a.longitude)*r;return (Math.atan2(Math.sin(d)*Math.cos(q),Math.cos(p)*Math.sin(q)-Math.sin(p)*Math.cos(q)*Math.cos(d))*180/Math.PI+360)%360}
export function routeProgress(route:DriverRoute,point:NavPoint){
 const coordinates=route.coordinates;
 if(coordinates.length<2)return{offRouteMetres:Infinity,remainingMetres:route.distance,remainingSeconds:route.duration,nextInstruction:'Waiting for route',turnMetres:0,matchedPoint:point,routeBearing:0,remainingCoordinates:coordinates};
 const scale=111195,cos=Math.cos(point.latitude*Math.PI/180);let best=Infinity,index=0,matchedT=0;
 const lengths:number[]=[];
 for(let i=0;i<coordinates.length-1;i++){const a=coordinates[i],b=coordinates[i+1],ax=(a[0]-point.longitude)*scale*cos,ay=(a[1]-point.latitude)*scale,bx=(b[0]-point.longitude)*scale*cos,by=(b[1]-point.latitude)*scale,dx=bx-ax,dy=by-ay,length=Math.hypot(dx,dy),t=length?Math.max(0,Math.min(1,-(ax*dx+ay*dy)/(length*length))):0,distance=Math.hypot(ax+t*dx,ay+t*dy);lengths.push(length);if(distance<best){best=distance;index=i;matchedT=t}}
 const total=lengths.reduce((a,b)=>a+b,0),hasDistances=route.segmentDistances?.length===lengths.length,hasDurations=route.segmentDurations?.length===lengths.length;
 const distances=hasDistances?route.segmentDistances!:lengths.map(n=>total?n/total*route.distance:0),durations=hasDurations?route.segmentDurations!:distances.map(n=>route.distance?n/route.distance*route.duration:0);
 let covered=0,elapsed=0;for(let i=0;i<index;i++){covered+=distances[i];elapsed+=durations[i]}covered+=distances[index]*matchedT;elapsed+=durations[index]*matchedT;
 const a=coordinates[index],b=coordinates[index+1],matchedPoint={longitude:a[0]+(b[0]-a[0])*matchedT,latitude:a[1]+(b[1]-a[1])*matchedT};
 // Keep the approaching turn until it is reached; do not skip it twelve metres early.
 const next=route.steps.find(step=>step.distanceFromStart>=covered-2&&step.distanceFromStart>1)??route.steps[route.steps.length-1];
 return{offRouteMetres:best,remainingMetres:Math.max(0,route.distance-covered),remainingSeconds:Math.max(0,route.duration-elapsed),nextInstruction:next?.instruction??'Continue ahead',turnMetres:Math.max(0,(next?.distanceFromStart??route.distance)-covered),matchedPoint,routeBearing:bearingBetween({longitude:a[0],latitude:a[1]},{longitude:b[0],latitude:b[1]}),remainingCoordinates:[[matchedPoint.longitude,matchedPoint.latitude] as [number,number],...coordinates.slice(index+1)]};
}
export function distanceLabel(metres:number){return metres<160?`${Math.round(metres*3.28084/10)*10} ft`:`${(metres/1609.344).toFixed(1)} mi`}

export type CourseFix=NavPoint&{accuracy:number;at:number;heading:number|null;speed:number|null};
export type DriverCourse={heading:number|null;anchor:CourseFix};
export function updateDriverCourse(previous:DriverCourse|null,fix:CourseFix):DriverCourse{
 const initial:DriverCourse=previous??{heading:null,anchor:fix};
 if(!Number.isFinite(fix.accuracy)||fix.accuracy>35)return initial;
 const dt=(fix.at-initial.anchor.at)/1000;
 if(previous&&dt<=0)return previous;
 if(fix.speed!==null&&fix.speed<1.5)return{heading:initial.heading,anchor:fix};
 let candidate:number|null=null;
 if(fix.speed!==null&&fix.speed>=1.5&&fix.heading!==null&&Number.isFinite(fix.heading))candidate=(fix.heading%360+360)%360;
 else if(previous&&dt>=.5&&dt<=15){const distance=metresBetween(initial.anchor,fix);if(distance>=Math.max(10,fix.accuracy*2,initial.anchor.accuracy*2)&&distance/dt>=1.5)candidate=bearingBetween(initial.anchor,fix)}
 if(candidate===null)return{heading:initial.heading,anchor:!previous||dt>15?fix:initial.anchor};
 const delta=initial.heading===null?0:((candidate-initial.heading+540)%360)-180;
 const heading=initial.heading===null?candidate:Math.abs(delta)<2?initial.heading:(initial.heading+delta*.55+360)%360;
 return{heading,anchor:fix};
}
