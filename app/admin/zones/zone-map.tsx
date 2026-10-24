'use client';
import {useEffect,useRef,useState} from 'react';
import {Map,NavigationControl,LngLatBounds} from 'maplibre-gl';
import {MaplibreTerradrawControl} from '@watergis/maplibre-gl-terradraw';
import {configuredMapStyle} from '@/lib/browser-map-style';
import type {TerraDraw,HexColor} from 'terra-draw';
import type {MapZoneInput} from '@/lib/map-zone-schema';
import 'maplibre-gl/dist/maplibre-gl.css';
import '@watergis/maplibre-gl-terradraw/dist/maplibre-gl-terradraw.css';
type Geometry=MapZoneInput['geometry'];
export default function ZoneMap({initialGeometry,onChange,theme,colour}:{initialGeometry:Geometry|null;onChange:(geometry:Geometry|null,count:number)=>void;theme:'light'|'dark';colour:string}){
 const container=useRef<HTMLDivElement>(null),initial=useRef(initialGeometry),drawRef=useRef<TerraDraw|null>(null),colourRef=useRef(colour);
 useEffect(()=>{colourRef.current=colour;const draw=drawRef.current;if(draw){for(const mode of ['polygon','rectangle','circle'])draw.setModeStyles(mode,{fillColor:colour as HexColor,outlineColor:colour as HexColor});draw.setModeStyles('select',{selectedPolygonColor:colour as HexColor,selectedPolygonOutlineColor:colour as HexColor})}},[colour]);
 const [error,setError]=useState(''),[revision,setRevision]=useState(0);
 useEffect(()=>{
  let map:Map|undefined,disposed=false;const abort=new AbortController();const timer=setTimeout(()=>abort.abort(),12000);let resize:ResizeObserver|undefined;
  void configuredMapStyle(theme,abort.signal).then(style=>{
   if(disposed||!container.current)return;
   map=new Map({container:container.current,style,center:[-4.1427,50.3755],zoom:11});map.addControl(new NavigationControl(),'top-right');
   map.once('load',()=>{
    if(disposed||!map)return;clearTimeout(timer);
    const control=new MaplibreTerradrawControl({modes:['polygon','rectangle','circle','select','delete-selection','delete'],open:true,showDeleteConfirmation:false});map.addControl(control,'top-left');
    const draw=control.getTerraDrawInstance();if(!draw){setError('Drawing tools could not start.');return}drawRef.current=draw;for(const mode of ['polygon','rectangle','circle'])draw.setModeStyles(mode,{fillColor:colourRef.current as HexColor,outlineColor:colourRef.current as HexColor});
    const multipart=initial.current?.type==='MultiPolygon';
    if(initial.current){const parts=initial.current.type==='MultiPolygon'?initial.current.coordinates:[initial.current.coordinates];draw.addFeatures(parts.map(coordinates=>({id:crypto.randomUUID(),type:'Feature' as const,properties:{mode:'polygon'},geometry:{type:'Polygon' as const,coordinates}})));const bounds=new LngLatBounds();parts.forEach(polygon=>polygon[0].forEach(p=>bounds.extend(p)));map.fitBounds(bounds,{padding:65,maxZoom:15,duration:0})}
    const update=()=>{const polygons=draw.getSnapshot().filter(feature=>feature.geometry.type==='Polygon');initial.current=multipart&&polygons.length?{type:'MultiPolygon',coordinates:polygons.map(p=>(p.geometry as Extract<Geometry,{type:'Polygon'}>).coordinates)}:polygons.length===1?polygons[0].geometry as Geometry:null;onChange(initial.current,multipart&&polygons.length?1:polygons.length)};
    draw.on('change',update);draw.on('finish',()=>draw.setMode('select'));update();resize=new ResizeObserver(()=>map?.resize());resize.observe(container.current!);
   });
   map.on('error',event=>{if(!disposed&&event.error?.message?.includes('WebGL'))setError('Map rendering is unavailable in this browser.')});
  }).catch(()=>{if(!disposed)setError('Unable to load map.')});
  return()=>{disposed=true;drawRef.current=null;abort.abort();clearTimeout(timer);resize?.disconnect();map?.remove()};
 },[theme,revision,onChange]);
 return <div className="zone-map-wrap"><div ref={container} className="zone-map" aria-label="Draw zone boundary on map"/>{error&&<div className="zone-map-error" role="alert">{error}<button type="button" onClick={()=>{setError('');setRevision(n=>n+1)}}>Retry map</button></div>}</div>;
}
