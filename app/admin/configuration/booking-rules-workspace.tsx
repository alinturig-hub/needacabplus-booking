'use client';
import{useIntegrations}from'@/components/integrations/integration-provider';
import {useState} from 'react';
import CustomerSettings from './customer-settings';
import NativeBookingSettings from './native-booking-settings';
import './booking-rules-workspace.css';
export default function BookingRulesWorkspace(){
 const{autocabEnabled,loading}=useIntegrations();
 const [model,setModel]=useState<'autocab'|'native'>('autocab'),[visitedNative,setVisitedNative]=useState(false);
 const current=autocabEnabled?model:'native';
 if(loading)return <p>Loading booking models…</p>;
 function choose(next:'autocab'|'native'){setModel(next);if(next==='native')setVisitedNative(true)}
 return <section className="booking-model-workspace"><header className="booking-model-heading"><h2>Booking rules</h2><p>Choose the booking model. Each model has its own saved settings and save action.</p></header>
  <div className="booking-model-tabs" role="tablist" aria-label="Booking model">{(['autocab','native'] as const).filter(id=>id==='native'||autocabEnabled).map((id,index)=><button type="button" key={id} id={`booking-model-${id}`} role="tab" aria-selected={current===id} aria-controls={`booking-panel-${id}`} tabIndex={current===id?0:-1} onClick={()=>choose(id)} onKeyDown={event=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();const next=!autocabEnabled?'native':event.key==='Home'?'autocab':event.key==='End'?'native':index===0?'native':'autocab';choose(next);document.getElementById(`booking-model-${next}`)?.focus()}}}><strong>{id==='autocab'?'Autocab':'Need A Cab Plus'}</strong><span>{id==='autocab'?'Customer bookings through Autocab':'Native booking model'}</span></button>)}</div>
  <div id="booking-panel-autocab" role="tabpanel" aria-labelledby="booking-model-autocab" hidden={current!=='autocab'}>{autocabEnabled&&<CustomerSettings section="bookings"/>}</div>
  <div id="booking-panel-native" role="tabpanel" aria-labelledby="booking-model-native" hidden={current!=='native'}>{(visitedNative||!autocabEnabled)&&<NativeBookingSettings/>}</div>
 </section>;
}
