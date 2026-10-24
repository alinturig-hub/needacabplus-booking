'use client';
import {useEffect,useRef,useState} from 'react';
import {Map,NavigationControl,LngLatBounds,type GeoJSONSource,type StyleSpecification} from 'maplibre-gl';
import {MaplibreTerradrawControl} from '@watergis/maplibre-gl-terradraw';
import {configuredMapStyle,openStreetMapStyle} from '@/lib/browser-map-style';
import {zoneMapFeatures,type DisplayZone} from '@/lib/map-zone-display';
import type {TerraDraw,HexColor} from 'terra-draw';
import type {MapZoneInput} from '@/lib/map-zone-schema';
import 'maplibre-gl/dist/maplibre-gl.css';
import '@watergis/maplibre-gl-terradraw/dist/maplibre-gl-terradraw.css';
type Geometry=MapZoneInput['geometry'];
type Props={initialGeometry:Geometry|null;onChange:(geometry:Geometry|null,count:number)=>void;theme:'light'|'dark';colour:string;zones:DisplayZone[];selectedId:string|null;onSelect:(id:string)=>void;editing:boolean};
export default function ZoneMap({initialGeometry,onChange,theme,colour,zones,selectedId,onSelect,editing}:Props){
 const container=useRef<HTMLDivElement>(null),initial=useRef(initialGeometry),drawRef=useRef<TerraDraw|null>(null),colourRef=useRef(colour),mapRef=useRef<Map|null>(null),props=useRef({zones,selectedId,onSelect});
 useEffect(()=>{props.current={zones,selectedId,onSelect}},[zones,selectedId,onSelect]);
 const [error,setError]=useState(''),[revision,setRevision]=useState(0),[ready,setReady]=useState(false);
 useEffect(()=>{colourRef.current=colour;const draw=drawRef.current;if(draw){for(const mode of ['polygon','rectangle','circle'])draw.setModeStyles(mode,{fillColor:colour as HexColor,outlineColor:colour as HexColor});draw.setModeStyles('select',{selectedPolygonColor:colour as HexColor,selectedPolygonOutlineColor:colour as HexColor})}},[colour]);
 useEffect(()=>{
  if(!ready||!mapRef.current)return;const map=mapRef.current,data=zoneMapFeatures(zones,selectedId);
  (map.getSource('zone-boundaries') as GeoJSONSource)?.setData(data.boundaries);
  (map.getSource('zone-labels') as GeoJSONSource)?.setData(data.labels);
 },[zones,selectedId,ready]);
 useEffect(()=>{
  let map:Map|undefined,disposed=false;const abort=new AbortController();const timer=setTimeout(()=>abort.abort(),12000);let resize:ResizeObserver|undefined;
  void (async()=>{
   let style=await configuredMapStyle(theme,abort.signal);
   if(typeof style==='string'){try{const response=await fetch(style,{signal:abort.signal});style=response.ok?await response.json() as StyleSpecification:openStreetMapStyle}catch{style=openStreetMapStyle}}
   if(disposed||!container.current)return;
   style={...style,glyphs:style.glyphs||'https://fonts.openmaptiles.org/{fontstack}/{range}.pbf'};
   map=new Map({container:container.current,style,center:[-4.13,50.398],zoom:12.2});mapRef.current=map;map.addControl(new NavigationControl(),'top-right');
   map.once('load',()=>{
    if(disposed||!map)return;clearTimeout(timer);const data=zoneMapFeatures(props.current.zones,props.current.selectedId);
    map.addSource('zone-boundaries',{type:'geojson',data:data.boundaries});map.addSource('zone-labels',{type:'geojson',data:data.labels});
    map.addLayer({id:'zone-fills',type:'fill',source:'zone-boundaries',filter:['all',['!=',['get','operating'],true],['!=',['get','broad'],true],['!=',['get','reference'],true]],paint:{'fill-color':['case',['get','selected'],'#da915c','#5c99c0'],'fill-opacity':['case',['get','selected'],0.28,0.08]}});
    map.addLayer({id:'zone-outlines',type:'line',source:'zone-boundaries',filter:['!=',['get','reference'],true],paint:{'line-color':['case',['get','selected'],'#b35b40',['get','operating'],'#aa8030','#4189bc'],'line-width':['case',['get','selected'],2.6,['get','operating'],2,1.4]}});
    map.addLayer({id:'zone-reference-outlines',type:'line',source:'zone-boundaries',filter:['==',['get','reference'],true],paint:{'line-color':'#ba793c','line-width':1.8,'line-dasharray':[3,2]}});
    map.addLayer({id:'zone-codes',type:'symbol',source:'zone-labels',minzoom:8,layout:{'text-field':['get','label'],'text-font':['Open Sans Bold'],'text-size':['interpolate',['linear'],['zoom'],9,10,12,15,15,19],'text-padding':3,'text-allow-overlap':false},paint:{'text-color':'#fff','text-halo-color':'#15232c','text-halo-width':2.2,'text-halo-blur':0.2}});
    if(initial.current){const parts=initial.current.type==='MultiPolygon'?initial.current.coordinates:[initial.current.coordinates];const bounds=new LngLatBounds();parts.forEach(p=>p[0].forEach(v=>bounds.extend(v)));map.fitBounds(bounds,{padding:70,maxZoom:14,duration:0})}
    if(!editing){
     map.on('click',event=>{const hits=map!.queryRenderedFeatures(event.point,{layers:['zone-codes','zone-fills','zone-reference-outlines','zone-outlines']});const hit=hits.find(f=>!f.properties?.operating)||hits[0];if(hit?.properties?.id)props.current.onSelect(String(hit.properties.id))});
     map.on('mousemove',event=>{const hits=map!.queryRenderedFeatures(event.point,{layers:['zone-codes','zone-fills','zone-reference-outlines','zone-outlines']});map!.getCanvas().style.cursor=hits.length?'pointer':''});
    }else{
     const control=new MaplibreTerradrawControl({modes:['polygon','rectangle','circle','select','delete-selection','delete'],open:true,showDeleteConfirmation:false,adapterOptions:{coordinatePrecision:17}});map.addControl(control,'top-left');
     const draw=control.getTerraDrawInstance();if(!draw){setError('Drawing tools could not start.');return}control.activate();drawRef.current=draw;
     for(const mode of ['polygon','rectangle','circle'])draw.setModeStyles(mode,{fillColor:colourRef.current as HexColor,outlineColor:colourRef.current as HexColor});
     const multipart=initial.current?.type==='MultiPolygon';
     if(initial.current){const parts=initial.current.type==='MultiPolygon'?initial.current.coordinates:[initial.current.coordinates];draw.addFeatures(parts.map(coordinates=>({id:crypto.randomUUID(),type:'Feature' as const,properties:{mode:'polygon'},geometry:{type:'Polygon' as const,coordinates}})));draw.setMode('select')}
     const update=()=>{const polygons=draw.getSnapshot().filter(f=>f.geometry.type==='Polygon');initial.current=multipart&&polygons.length?{type:'MultiPolygon',coordinates:polygons.map(p=>(p.geometry as Extract<Geometry,{type:'Polygon'}>).coordinates)}:polygons.length===1?polygons[0].geometry as Geometry:null;onChange(initial.current,multipart&&polygons.length?1:polygons.length)};
     draw.on('change',update);draw.on('finish',()=>draw.setMode('select'));
    }
    setReady(true);resize=new ResizeObserver(()=>map?.resize());resize.observe(container.current!);
   });
   map.on('error',event=>{if(!disposed&&event.error?.message?.includes('WebGL'))setError('Map rendering is unavailable in this browser.')});
  })().catch(()=>{if(!disposed)setError('Unable to load map.')});
  return()=>{disposed=true;mapRef.current=null;drawRef.current=null;abort.abort();clearTimeout(timer);resize?.disconnect();map?.remove()};
 },[theme,revision,onChange,editing]);
 return <div className="zone-map-wrap"><div ref={container} className="zone-map" aria-label="Plot zones map" data-boundaries={zones.filter(z=>z.purpose!=='system').length}/>{error&&<div className="zone-map-error" role="alert">{error}<button type="button" onClick={()=>{setError('');setRevision(n=>n+1)}}>Retry map</button></div>}</div>;
}
