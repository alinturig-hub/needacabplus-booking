'use client';
import {useEffect,useRef,useState} from 'react';
import {Map,Marker,LngLatBounds,type GeoJSONSource} from 'maplibre-gl';
import {configuredMapStyle,openStreetMapStyle} from '@/lib/browser-map-style';
import {routeProgress,type DriverRoute,type NavPoint} from '@/lib/driver-navigation';
type Props={route:DriverRoute|null;position:NavPoint;destination?:NavPoint;pickup?:NavPoint;following?:boolean;navigating?:boolean;heading?:number|null;accuracy?:number|null;recenter?:number;bottomInset?:number;onPan?:()=>void};
export default function NavigationMap({route,position,destination,pickup,following=true,navigating=false,heading=null,accuracy=null,recenter=0,bottomInset=150,onPan}:Props){
 const container=useRef<HTMLDivElement>(null),mapRef=useRef<Map|null>(null),driverRef=useRef<Marker|null>(null),endRef=useRef<Marker|null>(null),panRef=useRef(onPan),pickupRef=useRef<Marker|null>(null),cameraRef=useRef<{lat:number;lon:number;recenter:number;following:boolean}|null>(null);
 useEffect(()=>{panRef.current=onPan},[onPan]);
 const endLat=destination?.latitude,endLon=destination?.longitude,pickupLat=pickup?.latitude,pickupLon=pickup?.longitude;
 const [ready,setReady]=useState(false),[error,setError]=useState(false);
 useEffect(()=>{let disposed=false,fallback=false;const abort=new AbortController();let map:Map|undefined;const markers:Marker[]=[];
 void configuredMapStyle('dark',abort.signal).then(style=>{if(disposed||!container.current)return;
 const fallbackStyle={...openStreetMapStyle,layers:openStreetMapStyle.layers.map(layer=>layer.type==='raster'?{...layer,paint:{'raster-saturation':-.7,'raster-brightness-max':.58}}:layer)};
 map=new Map({container:container.current,style:typeof style==='string'?style:fallbackStyle,center:[-4.1427,50.3755],zoom:12.5,pitch:0,attributionControl:{compact:true}});mapRef.current=map;
 map.on('dragstart',e=>{if(e.originalEvent)panRef.current?.()});
 map.once('load',()=>{if(disposed||!map)return;setError(false);map.addSource('driver-route',{type:'geojson',data:{type:'FeatureCollection',features:[]}});
 map.addLayer({id:'driver-route-outline',type:'line',source:'driver-route',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#14392e','line-width':11}});
 map.addLayer({id:'driver-route-line',type:'line',source:'driver-route',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#a2ffda','line-width':5}});
 const arrow=document.createElement('div');arrow.className='driver-position';arrow.innerHTML='<span>▲</span>';driverRef.current=new Marker({element:arrow,rotationAlignment:'map'}).setLngLat([-4.1423,50.3697]).addTo(map);markers.push(driverRef.current);
 const end=document.createElement('div');end.className='driver-destination';end.textContent='■';endRef.current=new Marker({element:end}).setLngLat([-4.1436,50.3778]);markers.push(endRef.current);const pin=document.createElement('div');pin.className='driver-pickup-marker';pin.textContent='●';pickupRef.current=new Marker({element:pin}).setLngLat([-4.1436,50.3778]);markers.push(pickupRef.current);setReady(true)});
 map.on('error',()=>{if(disposed||!map||map.isStyleLoaded())return;if(!fallback&&typeof style==='string'){fallback=true;map.setStyle(fallbackStyle);return}setError(true)})
 }).catch(()=>{if(!disposed)setError(true)});
 const resize=new ResizeObserver(()=>map?.resize());if(container.current)resize.observe(container.current);
 return()=>{disposed=true;abort.abort();resize.disconnect();markers.forEach(m=>m.remove());map?.remove();mapRef.current=null}
 },[]);
 useEffect(()=>{if(!ready||!mapRef.current||!container.current)return;const map=mapRef.current;map.resize();const width=container.current.clientWidth,height=container.current.clientHeight,desktop=width>=800;
 const padding={top:Math.min(160,height*.2),right:desktop?80:36,bottom:desktop?60:Math.min(bottomInset+28,height*.62),left:desktop?470:36};
 const source=map.getSource('driver-route') as GeoJSONSource;source?.setData(route?{type:'Feature',properties:{},geometry:{type:'LineString',coordinates:route.coordinates}}:{type:'FeatureCollection',features:[]});
 if(route&&!navigating){map.easeTo({bearing:0,pitch:0,duration:0});const bounds=new LngLatBounds();route.coordinates.forEach(p=>bounds.extend(p));map.fitBounds(bounds,{padding,maxZoom:15,duration:500})}else if(!route)map.easeTo({zoom:12.5,bearing:0,pitch:0,center:[position.longitude,position.latitude],offset:[desktop?195:0,(padding.top-padding.bottom)/2],duration:300});
 // Refit when the sheet changes size; GPS following is handled separately.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[route,ready,bottomInset,navigating]);
 useEffect(()=>{if(!ready||!mapRef.current)return;const progress=route?routeProgress(route,position):null,matched=navigating&&progress&&progress.offRouteMetres<=30&&(accuracy??100)<=40?progress.matchedPoint:position;driverRef.current?.setLngLat([matched.longitude,matched.latitude]);driverRef.current?.setRotation(navigating?(heading??progress?.routeBearing??0):0);
 if(endLat!==undefined&&endLon!==undefined)endRef.current?.setLngLat([endLon,endLat]).addTo(mapRef.current);else endRef.current?.remove();
 if(pickupLat!==undefined&&pickupLon!==undefined)pickupRef.current?.setLngLat([pickupLon,pickupLat]).addTo(mapRef.current);else pickupRef.current?.remove();
 },[position,endLat,endLon,pickupLat,pickupLon,ready,route,navigating,heading,accuracy]);
 useEffect(()=>{if(!ready||!mapRef.current)return;const map=mapRef.current,prev=cameraRef.current;cameraRef.current={lat:position.latitude,lon:position.longitude,recenter,following};
 const moved=prev&&(prev.lat!==position.latitude||prev.lon!==position.longitude),requested=prev&&(prev.recenter!==recenter||!prev.following&&following);
 const width=container.current?.clientWidth??390,height=container.current?.clientHeight??844,desktop=width>=800;
 if(container.current)container.current.dataset.cameraMode=navigating&&following?'navigation':'overview';
 if(navigating&&following&&route){const progress=routeProgress(route,position),center=progress.offRouteMetres<=30&&(accuracy??100)<=40?progress.matchedPoint:position,top=Math.min(205,height*.3),visible=Math.max(80,height-bottomInset-top),y=top+visible*.72;
 map.easeTo({center:[center.longitude,center.latitude],bearing:heading??progress.routeBearing,pitch:45,zoom:progress.turnMetres<150?17.5:16.8,offset:[desktop?195:0,y-height/2],duration:650});
 }else if(following&&(!route||moved||requested)&&!navigating)map.easeTo({center:[position.longitude,position.latitude],offset:[desktop?195:0,(Math.min(160,height*.2)-(desktop?60:Math.min(bottomInset+28,height*.62)))/2],duration:500});
 },[position,following,recenter,ready,route,bottomInset,navigating,heading,accuracy]);
 return <div className="driver-map-layer"><div ref={container}/>{error&&<div className="driver-map-warning">Map unavailable. Check your connection or contact your operator.</div>}</div>;
}
