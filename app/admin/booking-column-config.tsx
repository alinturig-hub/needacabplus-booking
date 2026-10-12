'use client';

import {useEffect,useState} from 'react';
import {ArrowDown,ArrowUp,Check,GripVertical,Pencil,Plus,RotateCcw,Search,X} from 'lucide-react';

export const bookingColumns=[
 {id:'customer',label:'Customer',group:'Operations'},
 {id:'phone',label:'Phone',group:'Operations'},
 {id:'status',label:'Status',group:'Operations'},
 {id:'journey',label:'Journey',group:'Operations'},
 {id:'pickupDue',label:'Pickup time',group:'Operations'},
 {id:'bookingType',label:'Booking type',group:'Operations'},
 {id:'driver',label:'Driver',group:'Operations'},
 {id:'vehicle',label:'Vehicle',group:'Operations'},
 {id:'source',label:'Source',group:'Operations'},
 {id:'payment',label:'Payment',group:'Operations'},
 {id:'passengers',label:'Passengers',group:'Operations'},
 {id:'luggage',label:'Luggage',group:'Operations'},
 {id:'driverNote',label:'Driver note',group:'Operations'},
 {id:'officeNote',label:'Office note',group:'Operations'},
 {id:'bookedAt',label:'Booked at',group:'Operations'},
 {id:'dispatchedAt',label:'Dispatched at',group:'Operations'},
 {id:'arrivedAt',label:'Arrived at',group:'Operations'},
 {id:'completedAt',label:'Completed at',group:'Operations'},
 {id:'cost',label:'Cost',group:'Finance'},
 {id:'price',label:'Price',group:'Finance'},
 {id:'fare',label:'Fare',group:'Finance'},
 {id:'extraCost',label:'Extra cost',group:'Finance'},
 {id:'gratuity',label:'Gratuity',group:'Finance'},
 {id:'pricingTariff',label:'Pricing tariff',group:'Finance'},
 {id:'accountName',label:'Account name',group:'References'},
 {id:'accountCode',label:'Account code',group:'References'},
 {id:'companyName',label:'Company',group:'References'},
 {id:'bookedBy',label:'Booked by',group:'References'},
 {id:'ourReference',label:'Our reference',group:'References'},
 {id:'originalBookingId',label:'Original booking ID',group:'References'},
 {id:'flightDetails',label:'Flight details',group:'References'},
 {id:'customerEmail',label:'Customer email',group:'References'},
] as const;
export type BookingColumnId=(typeof bookingColumns)[number]['id'];
export const defaultBookingColumns:BookingColumnId[]=['customer','phone','status','journey','pickupDue','driver','vehicle','source','payment','cost','price','bookedAt'];
const presets:{name:string;columns:BookingColumnId[]}[]=[
 {name:'Operations',columns:defaultBookingColumns},
 {name:'Finance',columns:['customer','status','journey','payment','accountName','accountCode','cost','price','fare','extraCost','gratuity','pricingTariff','bookedAt']},
 {name:'Customer care',columns:['customer','phone','customerEmail','status','journey','pickupDue','driver','vehicle','passengers','luggage','driverNote','officeNote','flightDetails','bookedAt']},
];

type Props={selected:BookingColumnId[];onSelectedChange:(next:BookingColumnId[])=>void;labels:Record<string,string>;onLabelsChange:(next:Record<string,string>)=>void;onClose:()=>void};
export default function BookingColumnConfig({selected,onSelectedChange,labels,onLabelsChange,onClose}:Props){
 const [query,setQuery]=useState(''),[editing,setEditing]=useState<BookingColumnId|null>(null),[draft,setDraft]=useState(''),[dragged,setDragged]=useState<BookingColumnId|null>(null);
 useEffect(()=>{const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'){if(editing)setEditing(null);else onClose()}};document.addEventListener('keydown',escape);return()=>document.removeEventListener('keydown',escape)},[editing,onClose]);
 const add=(id:BookingColumnId)=>onSelectedChange(selected.includes(id)?selected:[...selected,id]);
 const remove=(id:BookingColumnId)=>onSelectedChange(selected.filter(item=>item!==id));
 const move=(id:BookingColumnId,direction:number)=>{const index=selected.indexOf(id),next=[...selected],other=index+direction;if(other<0||other>=next.length)return;[next[index],next[other]]=[next[other],next[index]];onSelectedChange(next)};
 const drop=(target:BookingColumnId)=>{if(!dragged||dragged===target)return;const next=selected.filter(id=>id!==dragged);next.splice(next.indexOf(target),0,dragged);onSelectedChange(next);setDragged(null)};
 const title=(id:BookingColumnId)=>labels[id]||bookingColumns.find(column=>column.id===id)?.label||id;
 const startRename=(id:BookingColumnId)=>{setEditing(id);setDraft(title(id))};
 const saveRename=(id:BookingColumnId)=>{const next=draft.trim().slice(0,40),updated={...labels};if(next&&next!==bookingColumns.find(column=>column.id===id)?.label)updated[id]=next;else delete updated[id];onLabelsChange(updated);setEditing(null)};
 const search=query.trim().toLowerCase();
 const matches=(id:BookingColumnId)=>{const column=bookingColumns.find(item=>item.id===id);return `${title(id)} ${column?.label??''} ${column?.group??''}`.toLowerCase().includes(search)};
 const visible=selected.filter(matches);
 const available=bookingColumns.filter(column=>!selected.includes(column.id)&&matches(column.id));
 return <div className="booking-columns-backdrop" onMouseDown={event=>{if(event.currentTarget===event.target)onClose()}}>
  <section className="booking-columns-dialog" role="dialog" aria-modal="true" aria-label="Customize booking table columns">
   <header><div><span className="eyebrow">YOUR WORKSPACE</span><h2>Customize booking table</h2><p>Choose the fields that help you manage jobs. Booking ID stays visible.</p></div><button type="button" className="booking-columns-close" onClick={onClose} aria-label="Close column settings"><X/></button></header>
   <div className="booking-columns-presets"><span>Quick layouts</span>{presets.map(preset=><button type="button" key={preset.name} onClick={()=>onSelectedChange([...preset.columns])}>{preset.name}</button>)}<button type="button" onClick={()=>{onSelectedChange([...defaultBookingColumns]);onLabelsChange({})}}><RotateCcw size={14}/> Reset</button></div>
   <div className="booking-columns-searchbar"><label className="booking-columns-search"><Search size={16}/><input value={query} onChange={event=>setQuery(event.target.value)} placeholder="Search all columns..." aria-label="Search all columns"/></label>{query&&<button type="button" onClick={()=>setQuery('')} aria-label="Clear column search"><X size={16}/></button>}</div>
   <div className="booking-columns-sections">
    <section className="booking-columns-selected"><div className="booking-columns-section-title"><h3>Visible columns</h3><span>{selected.length+1} / {bookingColumns.length+1}</span></div><p>{search?'Clear search to reorder columns.':'Drag to reorder, or use the arrow buttons.'}</p><div className="booking-columns-scroll">{'booking id'.includes(search)&&<div className="booking-column-row fixed"><span className="booking-column-index">01</span><strong>Booking ID</strong><small>Fixed</small></div>}{visible.map(id=>{const index=selected.indexOf(id);return <div className="booking-column-row" key={id} draggable={!search} onDragStart={()=>setDragged(id)} onDragEnd={()=>setDragged(null)} onDragOver={event=>event.preventDefault()} onDrop={()=>drop(id)}><GripVertical className="booking-column-grip" size={17}/><span className="booking-column-index">{String(index+2).padStart(2,'0')}</span>{editing===id?<form onSubmit={event=>{event.preventDefault();saveRename(id)}}><input aria-label={`Rename ${title(id)}`} value={draft} maxLength={40} onChange={event=>setDraft(event.target.value)} autoFocus/><button type="submit" aria-label="Save name"><Check size={16}/></button></form>:<strong title={title(id)}>{title(id)}</strong>}<div className="booking-column-actions"><button type="button" onClick={()=>startRename(id)} aria-label={`Rename ${title(id)}`}><Pencil size={14}/></button><button type="button" onClick={()=>move(id,-1)} disabled={!!search||index===0} aria-label={`Move ${title(id)} up`}><ArrowUp size={15}/></button><button type="button" onClick={()=>move(id,1)} disabled={!!search||index===selected.length-1} aria-label={`Move ${title(id)} down`}><ArrowDown size={15}/></button><button type="button" onClick={()=>remove(id)} aria-label={`Hide ${title(id)}`}><X size={16}/></button></div></div>})}{search&&visible.length===0&&!'booking id'.includes(search)&&<p className="booking-columns-empty">No visible columns match.</p>}</div></section>
    <section className="booking-columns-available"><div className="booking-columns-section-title"><h3>Available fields</h3><span>{available.length}</span></div><div className="booking-columns-scroll">{available.length?(['Operations','Finance','References'] as const).map(group=>{const items=available.filter(column=>column.group===group);return items.length?<div key={group}><h4>{group}</h4>{items.map(column=><button type="button" className="booking-column-add" key={column.id} onClick={()=>add(column.id)}><span>{column.label}</span><Plus size={16}/></button>)}</div>:null}):<p className="booking-columns-empty">No matching fields.</p>}</div></section>
   </div><footer><span>Changes are saved in this browser.</span><button type="button" onClick={onClose}>Done</button></footer>
  </section>
 </div>;
}
