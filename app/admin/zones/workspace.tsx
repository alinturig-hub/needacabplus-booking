'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import dynamic from 'next/dynamic';
import {Button} from '@/components/ui/button';
import {mapZoneInputSchema,type MapZone,type MapZoneInput} from '@/lib/map-zone-schema';
import type {DisplayZone,ReferenceZone} from '@/lib/map-zone-display';
import {useAdminInterface} from '../admin-interface';
import './zones.css';
const ZoneMap=dynamic(()=>import('./zone-map'),{ssr:false,loading:()=> <p>Loading map…</p>});
const publication=(zone:MapZone)=>!zone.published_snapshot?'Draft':zone.published_version===zone.version?'Live':'Live + draft changes';
const purposes={operational:'Operating area',plot:'Driver plot zone'};
const blank={name:'',colour:'#d4b66a',purpose:'plot' as MapZoneInput['purpose'],enabled:true};
function code(zone:DisplayZone){const raw=zone.source_payload;return raw?.mdtZoneId!==undefined?`(${raw.mdtZoneId}) ${raw.descriptor||zone.name}`:zone.name}
export default function ZoneWorkspace(){
 const [zones,setZones]=useState<MapZone[]>([]),[references,setReferences]=useState<ReferenceZone[]>([]),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 const [selected,setSelected]=useState<MapZone|null>(null),[reference,setReference]=useState<ReferenceZone|null>(null),[fields,setFields]=useState(blank),[geometry,setGeometry]=useState<MapZoneInput['geometry']|null>(null),[shapeCount,setShapeCount]=useState(0),[editor,setEditor]=useState(0),[showDisabled,setShowDisabled]=useState(false),[stage,setStage]=useState('all'),[dirty,setDirty]=useState(false),[category,setCategory]=useState('plot'),[search,setSearch]=useState(''),[editing,setEditing]=useState(false),[showOperating,setShowOperating]=useState(true),[creating,setCreating]=useState(false);
 const [pickedIds,setPickedIds]=useState<string[]>([]);
 const currentGeometry=useRef<MapZoneInput['geometry']|null>(null);
 const {theme}=useAdminInterface();
 const load=useCallback(async()=>{
  setLoading(true);setPickedIds([]);try{
   const response=await fetch('/api/admin/zones',{cache:'no-store'});const data=await response.json() as {zones:MapZone[];error?:string};if(!response.ok)throw Error(data.error||'Unable to load zones.');setZones(data.zones);setError('');
   const extra=await fetch('/api/admin/zones/references',{cache:'no-store'});if(!extra.ok)throw Error('Saved zones loaded, but Autocab reference boundaries could not be loaded.');const ref=await extra.json() as {zones:ReferenceZone[]};setReferences(ref.zones);
  }catch(e){setError(e instanceof Error?e.message:'Unable to load zones.')}finally{setLoading(false)}
 },[]);
 useEffect(()=>{const timer=setTimeout(()=>void load(),0);return()=>clearTimeout(timer)},[load]);
 function open(zone:DisplayZone|null){
  if(dirty&&!window.confirm('Discard unsaved zone changes?'))return;
  const isReference=zone&&'reference' in zone;
  setReference(isReference?zone:null);setSelected(zone&&!isReference?zone:null);setCreating(!zone);
  setFields(zone?{name:zone.name,colour:'colour' in zone?zone.colour:'#ba793c',purpose:zone.purpose,enabled:zone.enabled}:blank);
  const next=zone&&!isReference?zone.geometry:null;currentGeometry.current=next;setGeometry(next);setShapeCount(next?1:0);setEditor(n=>n+1);setEditing(!zone);setDirty(false);setError('');setMessage('');
 }
 const changed=useCallback((next:MapZoneInput['geometry']|null,count:number)=>{if(JSON.stringify(currentGeometry.current)!==JSON.stringify(next))setDirty(true);currentGeometry.current=next;setGeometry(next);setShapeCount(count)},[]);
 async function save(){
  setError('');setMessage('');const parsed=mapZoneInputSchema.safeParse({...fields,geometry});if(!parsed.success||shapeCount!==1){setError(shapeCount>1?'Keep one boundary per zone. Remove extra shapes before saving.':parsed.success?'Draw a boundary before saving.':parsed.error.issues[0]?.message||'Check zone details.');return}
  setBusy(true);try{const response=await fetch('/api/admin/zones',{method:selected?'PUT':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...parsed.data,...(selected?{id:selected.id,version:selected.version}:{})})});const data=await response.json() as {zone:MapZone;error?:string};if(!response.ok)throw Error(data.error||'Unable to save zone.');const saved=data.zone;setZones(current=>[...current.filter(zone=>zone.id!==saved.id),saved]);setSelected(saved);setCreating(false);setDirty(false);setMessage('Draft saved. The published live boundary is unchanged.')}catch(e){setError(e instanceof Error?e.message:'Unable to save zone.')}finally{setBusy(false)}
 }
 async function remove(){
  if(!selected||busy)return;
  if(!window.confirm(`Delete zone “${selected.name}”?${selected.published_snapshot?' It will also be removed from the live map.':''} Original source data and version history will be retained.`))return;
  setBusy(true);setError('');setMessage('');
  try{const response=await fetch('/api/admin/zones',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:selected.id,version:selected.version})});const data=await response.json() as {deleted?:boolean;error?:string};if(!response.ok)throw Error(data.error||'Unable to delete zone.');setZones(current=>current.filter(zone=>zone.id!==selected.id));setPickedIds(ids=>ids.filter(id=>id!==selected.id));setSelected(null);setReference(null);setCreating(false);setEditing(false);setDirty(false);currentGeometry.current=null;setGeometry(null);setShapeCount(0);setFields(blank);setEditor(n=>n+1);setMessage('Zone deleted from the map. Source data and version history are retained.')}catch(e){setError(e instanceof Error?e.message:'Unable to delete zone.')}finally{setBusy(false)}
 }
 async function publish(action:'publish'|'unpublish'){
  if(!selected||dirty)return;setBusy(true);setError('');setMessage('');
  try{const response=await fetch('/api/admin/zones',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:selected.id,version:selected.version,action})});const data=await response.json() as {zone:MapZone;error?:string};if(!response.ok)throw Error(data.error||'Unable to change publication.');setSelected(data.zone);setPickedIds(ids=>ids.filter(id=>id!==data.zone.id));setZones(current=>current.map(zone=>zone.id===data.zone.id?data.zone:zone));setMessage(action==='publish'?'Zone published live.':'Zone removed from live. Your draft is retained.')}catch(e){setError(e instanceof Error?e.message:'Unable to change publication.')}finally{setBusy(false)}
 }
 const filtered=zones.filter(zone=>(zone.purpose in purposes)&&(showDisabled||zone.enabled)&&(category==='all'||zone.purpose===category)&&(stage==='all'||(stage==='live'?Boolean(zone.published_snapshot):!zone.published_snapshot||zone.published_version!==zone.version)));
 const referenceZones=(category==='all'||category==='plot')&&stage!=='live'?references:[];
 const listed:DisplayZone[]=[...filtered,...referenceZones].filter(zone=>`${zone.name} ${code(zone)}`.toLowerCase().includes(search.trim().toLowerCase())).sort((a,b)=>Number(a.source_payload?.mdtZoneId??9999)-Number(b.source_payload?.mdtZoneId??9999)||a.name.localeCompare(b.name));
 const selectable=listed.filter((zone):zone is MapZone=>!('reference' in zone)&&zone.published_version!==zone.version);
 const picked=selectable.filter(zone=>pickedIds.includes(zone.id));
 const allPicked=selectable.length>0&&picked.length===selectable.length;
 async function publishPicked(){
  if(busy||loading||dirty||!picked.length)return;
  setBusy(true);setError('');setMessage('');
  try{
   const response=await fetch('/api/admin/zones/bulk-publish',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({zones:picked.map(zone=>({id:zone.id,version:zone.version}))})});
   const data=await response.json() as {zones:MapZone[];published:number;error?:string};if(!response.ok)throw Error(data.error||'Unable to publish selected zones.');
   const updated=new Map(data.zones.map(zone=>[zone.id,zone]));setZones(current=>current.map(zone=>updated.get(zone.id)||zone));setSelected(current=>current?updated.get(current.id)||current:null);setPickedIds([]);setMessage(`${data.published} zone${data.published===1?'':'s'} published live.`);
  }catch(e){setError(e instanceof Error?e.message:'Unable to publish selected zones.')}finally{setBusy(false)}
 }
 const mapZones:DisplayZone[]=[...filtered.map(zone=>stage==='live'&&zone.published_snapshot?{...zone,...zone.published_snapshot}:zone),...referenceZones];
 if(showOperating&&category==='plot')for(const zone of zones.filter(z=>z.purpose==='operational'&&(showDisabled||z.enabled)&&(stage!=='live'||z.published_snapshot)))if(!mapZones.some(z=>z.id===zone.id))mapZones.push(stage==='live'&&zone.published_snapshot?{...zone,...zone.published_snapshot}:zone);
 const current=selected||reference,operating=zones.find(z=>z.purpose==='operational');
 const selectedId=current?.id??null;
 function selectOnMap(id:string){if(busy||editing)return;const zone=[...zones,...references].find(z=>z.id===id);if(zone)open(zone)}
 function toggleEdit(){if(editing&&dirty){setError('Save your draft or select another zone to discard changes before leaving edit mode.');return}setEditing(!editing);setEditor(n=>n+1)}
 return <main className="zones-workspace">
  <header><div><span className="eyebrow">CONFIGURATION / ZONES</span><h1>Plot zones</h1><p>All boundaries on one map. Select a zone to inspect its details or edit its draft.</p></div><Button variant="outline" disabled={busy} onClick={()=>open(null)}>New zone</Button></header>
  <div className="zones-layout">
   <aside className="zones-sidebar">
    <section className="zones-list">
     <div className="zone-list-heading"><h2>Zones <small>{listed.length}</small></h2><button type="button" disabled={loading||busy} onClick={()=>void load()}>Refresh</button></div>
     {operating&&<button type="button" className="zone-operating-card" onClick={()=>open(operating)} disabled={busy}><span>OPERATING AREA</span><strong>United Kingdom</strong><small>England · Scotland · Wales · Northern Ireland</small></button>}
     <label className="zone-search">Find a zone<input aria-label="Find a zone" value={search} placeholder="Name, number or code" onChange={e=>{setSearch(e.target.value);setPickedIds([])}}/></label>
     <div className="zone-filters"><label>Type<select aria-label="Zone type filter" value={category} onChange={e=>{setCategory(e.target.value);setPickedIds([])}}><option value="all">All types</option>{Object.entries(purposes).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label><label>Publication<select aria-label="Zone publication filter" value={stage} onChange={e=>{setStage(e.target.value);setPickedIds([])}}><option value="all">Draft & live</option><option value="draft">Drafts</option><option value="live">Live only</option></select></label></div>
     <div className="zone-checkboxes"><label><input type="checkbox" checked={showOperating} onChange={e=>setShowOperating(e.target.checked)}/> UK outline</label><label><input type="checkbox" checked={showDisabled} onChange={e=>{setShowDisabled(e.target.checked);setPickedIds([])}}/> Disabled</label></div>
     <div className="zone-bulk"><label><input type="checkbox" aria-label="Select all filtered drafts" disabled={busy||loading||!selectable.length} checked={allPicked} ref={node=>{if(node)node.indeterminate=picked.length>0&&!allPicked}} onChange={e=>setPickedIds(e.target.checked?selectable.map(zone=>zone.id):[])}/> Select all drafts ({selectable.length})</label><small>{picked.length} selected · current filters only{dirty?' · Save your changes before publishing':''}</small></div>
     <div className="zone-results">{loading&&<p>Loading zones…</p>}{!loading&&!listed.length&&<p>No matching zones.</p>}{listed.map(zone=><div className="saved-zone-row" key={zone.id}><input type="checkbox" aria-label={`Select ${code(zone)} for publication`} title={'reference' in zone?'Reference boundary needs review':zone.published_version===zone.version?'Already live':'Select saved draft for publication'} disabled={busy||loading||'reference' in zone||zone.published_version===zone.version} checked={picked.some(item=>item.id===zone.id)} onChange={e=>setPickedIds(ids=>e.target.checked?[...ids.filter(id=>id!==zone.id),zone.id]:ids.filter(id=>id!==zone.id))}/><button type="button" disabled={busy} className="saved-zone" aria-pressed={selectedId===zone.id} onClick={()=>open(zone)}><i style={{background:'reference' in zone?'#ba793c':zone.colour}}/><span><strong>{code(zone)}</strong><small>{zone.name} · {'reference' in zone?'Reference · needs review':publication(zone)}</small></span></button></div>)}</div>
    </section>
    {(current||creating)&&<section className="zones-editor">
     <h2>{reference?'Source boundary':creating?'New zone':code(selected!)}</h2>
     <div className="zone-details"><label>Zone name<input maxLength={100} value={fields.name} disabled={busy||Boolean(reference)} onChange={e=>{setFields({...fields,name:e.target.value});setDirty(true)}}/></label><label>Zone type<select aria-label="Selected zone type" value={fields.purpose} disabled={busy||Boolean(reference)} onChange={e=>{setFields({...fields,purpose:e.target.value as MapZoneInput['purpose']});setDirty(true)}}>{Object.entries(purposes).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label><label>Colour<input type="color" value={fields.colour} disabled={busy||Boolean(reference)} onChange={e=>{setFields({...fields,colour:e.target.value});setDirty(true)}}/></label><label className="zone-enabled"><input type="checkbox" checked={fields.enabled} disabled={busy||Boolean(reference)} onChange={e=>{setFields({...fields,enabled:e.target.checked});setDirty(true)}}/> Enabled</label></div>
     {reference?<p className="zone-warning">Original Autocab boundary shown as a dashed reference. It needs geometry review before it can be saved or published.</p>:<><p className="zone-help">{selected?publication(selected):'New draft'}{dirty?' · Unsaved changes':''}. Editing a draft does not change its live boundary.</p></>}
     {current?.source_payload&&<details className="zone-source"><summary>Source settings</summary><p>{selected?.source_provider==='NATURAL_EARTH'?'Natural Earth · generalised UK national boundary.':'Autocab plotting settings retained as reference data.'}</p><pre>{JSON.stringify(current.source_payload,null,2)}</pre></details>}
    </section>}
   </aside>
   <section className="zones-map-panel">
    <header className="zone-map-heading"><div><h2>{editing?'Edit boundary':current?code(current):'Zone overview'}</h2><p>{reference?'Source boundary · review required':selected?`${publication(selected)}${dirty?' · Unsaved changes — save before publishing':''}`:creating?'New draft · save before publishing':'Click a boundary or its label to select a zone.'}</p></div><div><Button variant="outline" disabled={busy} onClick={()=>{if(dirty){setError('Save the current draft before returning to Plymouth.');return}setSelected(null);setReference(null);setCreating(false);setEditing(false);setEditor(n=>n+1)}}>Plymouth</Button><Button variant="outline" disabled={busy||Boolean(reference)||(!selected&&!creating)} onClick={toggleEdit}>{editing?'Finish editing':'Edit boundary'}</Button><Button className="zone-map-save" disabled={busy||loading||Boolean(reference)||(!selected&&!creating)||shapeCount!==1||!fields.name.trim()} title="Save the selected boundary as a draft" onClick={()=>void save()}>{busy?'Please wait…':'Save map'}</Button><Button className="zone-publish" disabled={busy||loading||dirty||!selected||Boolean(reference)||selected.published_version===selected.version} title={dirty?'Save your draft before publishing':'Publish the saved boundary to the live map'} onClick={()=>void publish('publish')}>Publish live</Button><Button className="zone-publish zone-publish-bulk" disabled={busy||loading||dirty||!picked.length||picked.length>500} title={dirty?'Save your current edits first':'Publish selected saved drafts matching the current filters'} onClick={()=>void publishPicked()}>Publish selected ({picked.length})</Button>{selected?.published_snapshot&&<Button variant="outline" disabled={busy||dirty} onClick={()=>void publish('unpublish')}>Move to draft</Button>}<Button className="zone-delete" variant="outline" disabled={busy||!selected} onClick={()=>void remove()}>Delete zone</Button></div></header>
    {(error||message)&&<div className="zone-map-feedback">{error&&<p className="zone-error" role="alert">{error}</p>}{message&&<p className="zone-success" role="status">{message}</p>}</div>}
    <fieldset disabled={busy} className={busy?'zone-map-saving':''}><ZoneMap key={`${editor}-${editing}`} initialGeometry={selected?.geometry??null} onChange={changed} theme={theme} colour={fields.colour} zones={mapZones} selectedId={selectedId} onSelect={selectOnMap} editing={editing}/></fieldset>
    <footer className="zone-map-legend"><span><i/> Plot zone</span><span><i className="selected"/> Selected</span><span><i className="reference"/> Source needs review</span><small>{stage==='live'?'Published boundaries':'Draft boundaries shown · live dispatch unchanged'}</small></footer>
   </section>
  </div>
 </main>;
}
