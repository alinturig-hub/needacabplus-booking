'use client';
import {FormEvent,useCallback,useEffect,useState} from 'react';
import {BadgePoundSterling,Clock3,CreditCard,KeyRound,Plus,Route,Save,ShieldCheck,Trash2} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';

type Dispatch={enabled:boolean;automaticDispatch:boolean;selectionStrategy:'nearest'|'longest_waiting'|'balanced';initialRadiusMiles:number;radiusStepMiles:number;maximumRadiusMiles:number;offerTimeoutSeconds:number;maximumOffers:number;scheduledLeadMinutes:number;requireOnShift:boolean;excludeSuspended:boolean};
type PriceRule={id:string;name:string;enabled:boolean;days:number[];startTime:string;endTime:string;adjustmentType:'percentage'|'fixed';adjustmentValue:number;priority:number};
type Pricing={enabled:boolean;globalAdjustmentPercent:number;rules:PriceRule[]};
type Stripe={enabled:boolean;mode:'test'|'live';publishableKey:string;currency:string;captureMethod:'automatic'|'manual';statementDescriptor:string;secretKeyConfigured:boolean;webhookSecretConfigured:boolean;secretKey:string;webhookSecret:string};
type SettingsResponse={dispatch:Dispatch;pricing:Pricing;stripe:Omit<Stripe,'secretKey'|'webhookSecret'>;error?:string};
const dispatchInitial:Dispatch={enabled:false,automaticDispatch:false,selectionStrategy:'nearest',initialRadiusMiles:2,radiusStepMiles:1,maximumRadiusMiles:8,offerTimeoutSeconds:25,maximumOffers:5,scheduledLeadMinutes:20,requireOnShift:true,excludeSuspended:true};
const pricingInitial:Pricing={enabled:false,globalAdjustmentPercent:0,rules:[]};
const stripeInitial:Stripe={enabled:false,mode:'test',publishableKey:'',currency:'gbp',captureMethod:'automatic',statementDescriptor:'NEED A CAB PLUS',secretKeyConfigured:false,webhookSecretConfigured:false,secretKey:'',webhookSecret:''};
const days=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const number=(value:string)=>Number.isFinite(Number(value))?Number(value):0;

function Toggle({checked,onChange,label}:{checked:boolean;onChange:(checked:boolean)=>void;label:string}){return <button type="button" className={`settings-toggle ${checked?'on':''}`} role="switch" aria-checked={checked} aria-label={label} onClick={()=>onChange(!checked)}><span/></button>}

export function DispatchSettings(){
 const [value,setValue]=useState(dispatchInitial),state=useSettings(setValue,undefined,undefined),{busy,error,message,save}=state;
 return <SettingsPanel icon={<Route/>} title="Dispatch rules" description="Control how a new booking is offered to available drivers." enabled={value.enabled} onEnabled={enabled=>setValue({...value,enabled})} error={error} message={message}>
  <form className="operations-form" onSubmit={event=>save(event,'dispatch',value)}><div className="settings-grid">
   <label>Driver selection<select value={value.selectionStrategy} onChange={e=>setValue({...value,selectionStrategy:e.target.value as Dispatch['selectionStrategy']})}><option value="nearest">Nearest available driver</option><option value="longest_waiting">Longest waiting driver</option><option value="balanced">Balanced distance and waiting time</option></select></label>
   <label>Initial search radius (miles)<Input type="number" min="0.1" max="100" step="0.1" value={value.initialRadiusMiles} onChange={e=>setValue({...value,initialRadiusMiles:number(e.target.value)})}/></label>
   <label>Expand radius by (miles)<Input type="number" min="0.1" max="100" step="0.1" value={value.radiusStepMiles} onChange={e=>setValue({...value,radiusStepMiles:number(e.target.value)})}/></label>
   <label>Maximum radius (miles)<Input type="number" min="0.1" max="200" step="0.1" value={value.maximumRadiusMiles} onChange={e=>setValue({...value,maximumRadiusMiles:number(e.target.value)})}/></label>
   <label>Driver offer timeout (seconds)<Input type="number" min="5" max="300" value={value.offerTimeoutSeconds} onChange={e=>setValue({...value,offerTimeoutSeconds:number(e.target.value)})}/></label>
   <label>Maximum driver offers<Input type="number" min="1" max="100" value={value.maximumOffers} onChange={e=>setValue({...value,maximumOffers:number(e.target.value)})}/></label>
   <label>Scheduled booking lead time (minutes)<Input type="number" min="0" max="1440" value={value.scheduledLeadMinutes} onChange={e=>setValue({...value,scheduledLeadMinutes:number(e.target.value)})}/></label>
  </div><div className="settings-checks"><label><Toggle checked={value.automaticDispatch} onChange={automaticDispatch=>setValue({...value,automaticDispatch})} label="Automatic dispatch"/><span><strong>Automatic dispatch</strong><small>Start driver search automatically when an eligible booking arrives.</small></span></label><label><Toggle checked={value.requireOnShift} onChange={requireOnShift=>setValue({...value,requireOnShift})} label="Require on shift"/><span><strong>Only drivers on shift</strong><small>Ignore drivers who are not currently working.</small></span></label><label><Toggle checked={value.excludeSuspended} onChange={excludeSuspended=>setValue({...value,excludeSuspended})} label="Exclude suspended drivers"/><span><strong>Exclude suspended drivers</strong><small>Suspended records can never receive a booking offer.</small></span></label></div><Button disabled={busy}><Save/>{busy?'Saving…':'Save dispatch rules'}</Button></form>
 </SettingsPanel>
}

export function PricingSettings(){
 const [value,setValue]=useState(pricingInitial),state=useSettings(undefined,setValue,undefined),{busy,error,message,save}=state;
 function add(){setValue({...value,rules:[...value.rules,{id:crypto.randomUUID(),name:'New price change',enabled:true,days:[1,2,3,4,5],startTime:'17:00',endTime:'23:00',adjustmentType:'percentage',adjustmentValue:10,priority:value.rules.length+1}]})}
 function update(id:string,change:Partial<PriceRule>){setValue({...value,rules:value.rules.map(rule=>rule.id===id?{...rule,...change}:rule)})}
 return <SettingsPanel icon={<BadgePoundSterling/>} title="Price changes" description="Apply scheduled increases or discounts on top of the base tariff." enabled={value.enabled} onEnabled={enabled=>setValue({...value,enabled})} error={error} message={message} action={<Button type="button" variant="outline" onClick={add}><Plus/>Add price rule</Button>}>
  <form className="operations-form" onSubmit={event=>save(event,'pricing',value)}><div className="settings-grid single-row"><label>Global adjustment (%)<Input type="number" min="-100" max="1000" step="0.1" value={value.globalAdjustmentPercent} onChange={e=>setValue({...value,globalAdjustmentPercent:number(e.target.value)})}/><small>Applied before scheduled rules. Use a negative number for a discount.</small></label></div>
   <div className="price-rules">{value.rules.length===0?<div className="settings-empty"><Clock3/><strong>No scheduled price changes</strong><span>Add peak hours, weekend charges or temporary discounts.</span></div>:value.rules.map(rule=><article key={rule.id}><header><Input aria-label="Rule name" value={rule.name} onChange={e=>update(rule.id,{name:e.target.value})}/><Toggle checked={rule.enabled} onChange={enabled=>update(rule.id,{enabled})} label={`Enable ${rule.name}`}/><button type="button" aria-label={`Delete ${rule.name}`} onClick={()=>setValue({...value,rules:value.rules.filter(item=>item.id!==rule.id)})}><Trash2/></button></header><div className="rule-fields"><label>Start<Input type="time" value={rule.startTime} onChange={e=>update(rule.id,{startTime:e.target.value})}/></label><label>End<Input type="time" value={rule.endTime} onChange={e=>update(rule.id,{endTime:e.target.value})}/></label><label>Change<select value={rule.adjustmentType} onChange={e=>update(rule.id,{adjustmentType:e.target.value as PriceRule['adjustmentType']})}><option value="percentage">Percentage (%)</option><option value="fixed">Fixed amount (£)</option></select></label><label>Value<Input type="number" min="-100" max="10000" step="0.01" value={rule.adjustmentValue} onChange={e=>update(rule.id,{adjustmentValue:number(e.target.value)})}/></label><label>Priority<Input type="number" min="0" max="1000" value={rule.priority} onChange={e=>update(rule.id,{priority:number(e.target.value)})}/></label></div><div className="day-picker">{days.map((day,index)=><button type="button" key={day} className={rule.days.includes(index)?'active':''} onClick={()=>update(rule.id,{days:rule.days.includes(index)?rule.days.filter(item=>item!==index):[...rule.days,index].sort()})}>{day}</button>)}</div></article>)}</div><Button disabled={busy}><Save/>{busy?'Saving…':'Save price changes'}</Button>
  </form>
 </SettingsPanel>
}

export function StripeSettings(){
 const [value,setValue]=useState(stripeInitial),state=useSettings(undefined,undefined,setValue),{busy,error,message,save}=state;
 return <SettingsPanel icon={<CreditCard/>} title="Stripe payment gateway" description="Store Stripe credentials securely and prepare card payment processing." enabled={value.enabled} onEnabled={enabled=>setValue({...value,enabled})} error={error} message={message}>
  <form className="operations-form" onSubmit={event=>save(event,'stripe',value)}><div className="settings-grid">
   <label>Mode<select value={value.mode} onChange={e=>setValue({...value,mode:e.target.value as Stripe['mode']})}><option value="test">Test mode</option><option value="live">Live mode</option></select></label><label>Currency<Input value={value.currency.toUpperCase()} maxLength={3} onChange={e=>setValue({...value,currency:e.target.value.toLowerCase()})}/></label>
   <label className="wide-field">Publishable key<Input type="password" autoComplete="off" placeholder="pk_test_…" value={value.publishableKey} onChange={e=>setValue({...value,publishableKey:e.target.value})}/></label>
   <label>Secret key<Input type="password" autoComplete="new-password" placeholder={value.secretKeyConfigured?'Saved — leave empty to keep it':'sk_test_…'} value={value.secretKey} onChange={e=>setValue({...value,secretKey:e.target.value})}/></label><label>Webhook signing secret<Input type="password" autoComplete="new-password" placeholder={value.webhookSecretConfigured?'Saved — leave empty to keep it':'whsec_…'} value={value.webhookSecret} onChange={e=>setValue({...value,webhookSecret:e.target.value})}/></label>
   <label>Payment capture<select value={value.captureMethod} onChange={e=>setValue({...value,captureMethod:e.target.value as Stripe['captureMethod']})}><option value="automatic">Charge automatically</option><option value="manual">Authorize, capture later</option></select></label><label>Statement descriptor<Input maxLength={22} value={value.statementDescriptor} onChange={e=>setValue({...value,statementDescriptor:e.target.value.toUpperCase()})}/></label>
  </div><div className="stripe-endpoint"><ShieldCheck/><div><strong>Stripe webhook endpoint</strong><code>https://webapp.needacabplus.app/api/payments/stripe/webhook</code><small>Add this address in Stripe after the payment webhook is activated.</small></div></div><Button disabled={busy}><KeyRound/>{busy?'Saving securely…':'Save Stripe settings'}</Button></form>
 </SettingsPanel>
}

function SettingsPanel({icon,title,description,enabled,onEnabled,error,message,action,children}:{icon:React.ReactNode;title:string;description:string;enabled:boolean;onEnabled:(value:boolean)=>void;error:string;message:string;action?:React.ReactNode;children:React.ReactNode}){return <div className="operations-settings"><div className="operations-heading"><div className="config-icon">{icon}</div><div><h3>{title}</h3><p>{description}</p></div><div className="operations-heading-actions">{action}<span>{enabled?'Enabled':'Disabled'}</span><Toggle checked={enabled} onChange={onEnabled} label={`Enable ${title}`}/></div></div>{error&&<p className="error-message" role="alert">{error}</p>}{message&&<p className="saved-message" role="status">{message}</p>}{children}</div>}

function useSettings(setDispatch?:React.Dispatch<React.SetStateAction<Dispatch>>,setPricing?:React.Dispatch<React.SetStateAction<Pricing>>,setStripe?:React.Dispatch<React.SetStateAction<Stripe>>){
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 const load=useCallback(async()=>{try{const response=await fetch('/api/admin/operations-settings',{cache:'no-store'}),data=await response.json() as SettingsResponse;if(!response.ok)throw new Error(data.error);setDispatch?.(data.dispatch);setPricing?.(data.pricing);setStripe?.({...data.stripe,secretKey:'',webhookSecret:''})}catch(reason){setError(reason instanceof Error?reason.message:'Unable to load settings.')}},[setDispatch,setPricing,setStripe]);
 useEffect(()=>{
  // The request resolves asynchronously and hydrates this client-only editor.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  void load();
 },[load]);
 async function save(event:FormEvent,section:'dispatch'|'pricing'|'stripe',value:Dispatch|Pricing|Stripe){event.preventDefault();setBusy(true);setError('');setMessage('');try{const payload:Record<string,unknown>={section,...value};if(section==='stripe'){delete payload.secretKeyConfigured;delete payload.webhookSecretConfigured}const response=await fetch('/api/admin/operations-settings',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}),data=await response.json() as {error?:string};if(!response.ok)throw new Error(data.error);setMessage('Configuration saved successfully.');await load()}catch(reason){setError(reason instanceof Error?reason.message:'Unable to save settings.')}finally{setBusy(false)}}
 return {busy,error,message,save};
}
