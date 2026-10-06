export type RoadPoint={latitude:number;longitude:number};

export async function customerRoadRoute(points:RoadPoint[],signal?:AbortSignal){
 if(points.length<2||points.some(point=>!Number.isFinite(point.latitude)||Math.abs(point.latitude)>90||!Number.isFinite(point.longitude)||Math.abs(point.longitude)>180))throw new Error('Invalid route points.');
 const coordinates=points.map(point=>`${point.longitude},${point.latitude}`).join(';');
 const response=await fetch(`https://router.project-osrm.org/route/v1/driving/${coordinates}?overview=full&geometries=geojson`,{signal,cache:'no-store'});
 if(!response.ok)throw new Error('Road route is temporarily unavailable.');
 const body=await response.json() as {code?:string;routes?:{geometry?:{coordinates?:unknown}}[]};
 const route=body.routes?.[0]?.geometry?.coordinates;
 if(body.code!=='Ok'||!Array.isArray(route)||route.length<2||route.some(point=>!Array.isArray(point)||point.length<2||!point.every(Number.isFinite)))throw new Error('Road route could not be calculated.');
 return route as number[][];
}
