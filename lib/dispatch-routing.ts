type Point={latitude:number;longitude:number};
export function validPoint(point:Point){return Number.isFinite(point.latitude)&&Math.abs(point.latitude)<=90&&Number.isFinite(point.longitude)&&Math.abs(point.longitude)<=180}
export function milesBetween(a:Point,b:Point){
 const rad=Math.PI/180,dLat=(b.latitude-a.latitude)*rad,dLon=(b.longitude-a.longitude)*rad;
 return 3958.8*2*Math.asin(Math.min(1,Math.sqrt(Math.sin(dLat/2)**2+Math.cos(a.latitude*rad)*Math.cos(b.latitude*rad)*Math.sin(dLon/2)**2)));
}
export function trackEstimate(source:Point,destination:Point,samples:(Point&{at:number})[],fallbackSpeedMph:number,detourFactor:number){
 if(!validPoint(source)||!validPoint(destination)||!Number.isFinite(fallbackSpeedMph)||fallbackSpeedMph<5||!Number.isFinite(detourFactor)||detourFactor<1)throw new Error('Invalid track estimation settings.');
 const ordered=samples.filter(p=>validPoint(p)&&Number.isFinite(p.at)).sort((a,b)=>a.at-b.at);
 const speeds:number[]=[];
 for(let i=1;i<ordered.length;i++){
  const seconds=(ordered[i].at-ordered[i-1].at)/1000;
  if(seconds<10||seconds>120)continue;
  const mph=milesBetween(ordered[i-1],ordered[i])*3600/seconds;
  if(mph>=5&&mph<=60)speeds.push(mph);
 }
 speeds.sort((a,b)=>a-b);
 // Three moving segments are required; stationary/GPS-jump samples cannot
 // produce zero travel times or infinite estimates. Clamp urban extrapolation.
 const observed=speeds.length>=3;
 const speedMph=observed?Math.max(8,Math.min(30,speeds[Math.floor(speeds.length/2)])):fallbackSpeedMph;
 return {etaSeconds:Math.ceil(milesBetween(source,destination)*detourFactor/speedMph*3600),speedMph,basis:observed?'recent moving tracks':'configured speed',sampleCount:speeds.length};
}
export async function roadDurations(sources:Point[],destination:Point):Promise<(number|null)[]>{
 const base=process.env.DISPATCH_OSRM_URL;
 if(!base)throw new Error('Road travel times are not configured. The example simulator is available below.');
 if(!sources.length)return [];
 if(![...sources,destination].every(validPoint))throw new Error('Pickup or vehicle coordinates are invalid.');
 const url=new URL(base);
 if(!['http:','https:'].includes(url.protocol))throw new Error('The road travel time service is not configured correctly.');
 url.pathname=`${url.pathname.replace(/\/$/,'')}/table/v1/driving/${[...sources,destination].map(p=>`${p.longitude},${p.latitude}`).join(';')}`;
 url.search=new URLSearchParams({sources:sources.map((_,i)=>i).join(';'),destinations:String(sources.length),annotations:'duration'}).toString();
 const response=await fetch(url,{signal:AbortSignal.timeout(8000),cache:'no-store',redirect:'error'});
 if(!response.ok)throw new Error('Road travel times are temporarily unavailable.');
 const body=await response.json() as {code?:string;durations?:unknown[]};
 if(body.code!=='Ok'||!Array.isArray(body.durations)||body.durations.length!==sources.length)throw new Error('Road travel times could not be calculated.');
 return body.durations.map((row:unknown)=>Array.isArray(row)&&typeof row[0]==='number'&&Number.isFinite(row[0])&&row[0]>=0?row[0]:null);
}
