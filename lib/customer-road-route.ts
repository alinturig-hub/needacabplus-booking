export type RoadPoint={latitude:number;longitude:number};

async function fetchRoadRoute(points:RoadPoint[],signal?:AbortSignal){
 if(points.length<2||points.some(point=>!Number.isFinite(point.latitude)||Math.abs(point.latitude)>90||!Number.isFinite(point.longitude)||Math.abs(point.longitude)>180))throw new Error('Invalid route points.');
 const coordinates=points.map(point=>`${point.longitude},${point.latitude}`).join(';');
 const response=await fetch(`https://router.project-osrm.org/route/v1/driving/${coordinates}?overview=full&geometries=geojson`,{signal,cache:'no-store'});
 if(!response.ok)throw new Error('Road route is temporarily unavailable.');
 const body=await response.json() as {code?:string;routes?:{distance?:number;duration?:number;geometry?:{coordinates?:unknown}}[]};
 const result=body.routes?.[0],route=result?.geometry?.coordinates;
 if(body.code!=='Ok'||!Array.isArray(route)||route.length<2||route.some(point=>!Array.isArray(point)||point.length<2||!point.every(Number.isFinite)))throw new Error('Road route could not be calculated.');
 return {coordinates:route as number[][],distanceMetres:result?.distance,durationSeconds:result?.duration};
}

export async function customerRoadRouteDetails(points:RoadPoint[],signal?:AbortSignal){
 const route=await fetchRoadRoute(points,signal);
 if(typeof route.distanceMetres!=='number'||!Number.isFinite(route.distanceMetres)||typeof route.durationSeconds!=='number'||!Number.isFinite(route.durationSeconds))throw new Error('Road route could not be calculated.');
 return {...route,distanceMetres:route.distanceMetres,durationSeconds:route.durationSeconds};
}

export async function customerRoadRoute(points:RoadPoint[],signal?:AbortSignal){
 return (await fetchRoadRoute(points,signal)).coordinates;
}
