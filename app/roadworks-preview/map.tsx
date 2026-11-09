'use client';
import {useEffect,useRef,useState} from 'react';
import {Map as LibreMap,NavigationControl,AttributionControl,type GeoJSONSource} from 'maplibre-gl';
import type {Feature,Geometry} from 'geojson';
import type {PreviewItem} from '@/lib/street-manager/preview-data';
function bounds(items:PreviewItem[]):[number,number,number,number]|null{
 const b:[number,number,number,number]=[Infinity,Infinity,-Infinity,-Infinity];
 for(const item of items){if(!item.bounds)continue;b[0]=Math.min(b[0],item.bounds[0]);b[1]=Math.min(b[1],item.bounds[1]);b[2]=Math.max(b[2],item.bounds[2]);b[3]=Math.max(b[3],item.bounds[3])}
 return Number.isFinite(b[0])?b:null;
}
export default function MapView({items,selected,onSelect,fitVersion,theme='light',supplementaryLegend=false}:{items:PreviewItem[];selected:PreviewItem|null;onSelect:(id:string)=>void;fitVersion:number;theme?:'light'|'dark';supplementaryLegend?:boolean}){
 const container=useRef<HTMLDivElement>(null),map=useRef<LibreMap|null>(null),itemsRef=useRef(items),selectRef=useRef(onSelect),didFit=useRef(false);
 const [ready,setReady]=useState(false),[mapError,setMapError]=useState(false);
 useEffect(()=>{itemsRef.current=items;selectRef.current=onSelect},[items,onSelect]);
 useEffect(()=>{
  if(!container.current)return;
  const instance=new LibreMap({container:container.current,style:theme==='dark'?'https://tiles.openfreemap.org/styles/fiord':'https://tiles.openfreemap.org/styles/liberty',center:[-4.142,50.385],zoom:12,attributionControl:false,maxPitch:0});map.current=instance;
  instance.addControl(new NavigationControl({showCompass:false}),'top-right');instance.addControl(new AttributionControl({compact:true}),'bottom-right');
  const collapseAttribution=()=>{const control=instance.getContainer().querySelector<HTMLDetailsElement>('details.maplibregl-ctrl-attrib');if(control?.classList.contains('maplibregl-compact')){control.classList.remove('maplibregl-compact-show');control.open=false}};
  instance.once('idle',collapseAttribution);
  instance.on('load',()=>{
   instance.addSource('roadworks',{type:'geojson',data:{type:'FeatureCollection',features:[]}});
   instance.addLayer({id:'work-fill',type:'fill',source:'roadworks',filter:['==',['geometry-type'],'Polygon'],paint:{'fill-color':['get','color'],'fill-opacity':.2}});
   instance.addLayer({id:'work-lines-halo',type:'line',source:'roadworks',filter:['!=',['geometry-type'],'Point'],paint:{'line-color':'#fff','line-width':8,'line-opacity':.85}});
   instance.addLayer({id:'work-lines',type:'line',source:'roadworks',filter:['!=',['geometry-type'],'Point'],paint:{'line-color':['get','color'],'line-width':4}});
   instance.addLayer({id:'work-points',type:'circle',source:'roadworks',filter:['==',['geometry-type'],'Point'],paint:{'circle-color':['get','color'],'circle-radius':8,'circle-stroke-color':'#fff','circle-stroke-width':2.5}});
   for(const layer of ['work-fill','work-lines','work-points']){
    instance.on('click',layer,e=>{const id=e.features?.[0]?.properties?.id;if(typeof id==='string')selectRef.current(id)});
    instance.on('mouseenter',layer,()=>{instance.getCanvas().style.cursor='pointer'});instance.on('mouseleave',layer,()=>{instance.getCanvas().style.cursor=''});
   }
   collapseAttribution();setReady(true);setMapError(false);
  });
  instance.on('error',()=>{if(!instance.isStyleLoaded())setMapError(true)});
  const observer=new ResizeObserver(()=>instance.resize());observer.observe(container.current);
  return()=>{observer.disconnect();instance.remove();map.current=null};
 },[theme]);
 useEffect(()=>{
  const instance=map.current;if(!instance||!ready)return;
  const features:Feature[]=[];
  const add=(g:Geometry,item:PreviewItem)=>{if(g.type==='GeometryCollection'){g.geometries.forEach(child=>add(child,item));return}features.push({type:'Feature',geometry:g,properties:{id:item.id,color:item.color}})};
  for(const item of items){if(!item.geometry||!item.bounds)continue;add(item.geometry,item);if(item.geometry.type!=='Point'&&item.geometry.type!=='MultiPoint'){const [w,s,e,n]=item.bounds;features.push({type:'Feature',geometry:{type:'Point',coordinates:[(w+e)/2,(s+n)/2]},properties:{id:item.id,color:item.color}})}}
  (instance.getSource('roadworks') as GeoJSONSource).setData({type:'FeatureCollection',features});
  const b=bounds(items);if(b&&!didFit.current){instance.fitBounds([[b[0],b[1]],[b[2],b[3]]],{padding:45,maxZoom:15,duration:0});didFit.current=true}
 },[items,ready]);
 useEffect(()=>{const b=bounds(itemsRef.current);if(ready&&b)map.current?.fitBounds([[b[0],b[1]],[b[2],b[3]]],{padding:45,maxZoom:15,duration:0})},[fitVersion,ready]);
 useEffect(()=>{const b=selected?.bounds;if(ready&&b)map.current?.fitBounds([[b[0],b[1]],[b[2],b[3]]],{padding:65,maxZoom:16,duration:0})},[selected,ready]);
 return <section className="rw-map" aria-label="Map of received Plymouth roadworks"><div className="rw-canvas" ref={container}/>{!ready&&<div className="rw-map-message" role="status">{mapError?'Map could not load. Roadworks details remain available in the list.':'Loading Plymouth map…'}</div>}<div className="rw-map-note">Select a marker or a street in the list</div><div className="rw-legend"><span><i style={{background:'#f87171'}}/>Closure reported</span><span><i style={{background:'#f5be58'}}/>Works / activity</span><span><i style={{background:'#a78bfa'}}/>Section 58</span><span><i style={{background:'#8b99a5'}}/>Ended / review</span>{supplementaryLegend&&<span><i style={{background:'#6ac4ce'}}/>Council notice</span>}</div></section>;
}
