'use client';
import {useEffect,useRef,useState,useSyncExternalStore} from 'react';
import type {FormEvent} from 'react';
import Link from 'next/link';
import {z} from 'zod';
type GPS={latitude:number;longitude:number;accuracy:number;timestamp:number};
type Recognition={lang:string;interimResults:boolean;onresult:((e:{results:{[key:number]:{[key:number]:{transcript:string}}};resultIndex:number})=>void)|null;onerror:(()=>void)|null;onend:(()=>void)|null;start:()=>void;stop:()=>void};
type SpeechWindow={SpeechRecognition?:new()=>Recognition;webkitSpeechRecognition?:new()=>Recognition};
const subscribe=()=>()=>{};
const supportsDictation=()=>Boolean((window as unknown as SpeechWindow).SpeechRecognition||(window as unknown as SpeechWindow).webkitSpeechRecognition);
async function position():Promise<GPS|null>{return new Promise(resolve=>{if(!navigator.geolocation){resolve(null);return;}navigator.geolocation.getCurrentPosition(p=>resolve(p.coords.accuracy<=100?{latitude:p.coords.latitude,longitude:p.coords.longitude,accuracy:p.coords.accuracy,timestamp:p.timestamp}:null),()=>resolve(null),{enableHighAccuracy:true,maximumAge:0,timeout:7000});});}
export default function VoiceBooking(){
 const [started,setStarted]=useState(false),[ended,setEnded]=useState(false),[busy,setBusy]=useState(false),[text,setText]=useState(''),[speech,setSpeech]=useState('Tell us where you would like to go. We will confirm the pickup and cash fare with you.'),[error,setError]=useState(''),[gps,setGPS]=useState<GPS|null>(null),[readReplies,setReadReplies]=useState(false),[listening,setListening]=useState(false);
 const [field,setField]=useState<'address'|'name'|'phone'>('address');
 const recognition=useRef<Recognition|null>(null),canDictate=useSyncExternalStore(subscribe,supportsDictation,()=>false);
 useEffect(()=>()=>{recognition.current?.stop();window.speechSynthesis?.cancel();},[]);
 async function send(action:'start'|'message'|'reset',message?:string,location?:GPS|null){
  if(busy)return;recognition.current?.stop();setBusy(true);setError('');window.speechSynthesis?.cancel();
  try{
   const fresh=location===undefined&&gps?await position():location; if(location===undefined&&gps)setGPS(fresh||null);
   const response=await fetch('/api/voice/conversation',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,id:crypto.randomUUID(),...(message?{text:message}:{}),...(fresh?{gps:fresh}:{})})});
   const payload:unknown=await response.json();if(!response.ok){const failure=z.object({error:z.string().max(250)}).safeParse(payload);throw Error(failure.success?failure.data.error:'Please try again.');}
   const parsed=z.object({speech:z.string().max(6000),ended:z.boolean(),field:z.enum(['address','name','phone']).optional()}).safeParse(payload);if(!parsed.success)throw Error('Voice preview is temporarily unavailable.');const result=parsed.data;
   setField(result.field||'address');setStarted(true);setEnded(Boolean(result.ended));setSpeech(result.speech);setText('');
   if(readReplies&&window.speechSynthesis){const utterance=new SpeechSynthesisUtterance(result.speech);utterance.lang='en-GB';window.speechSynthesis.speak(utterance);}
  }catch(e){setError(e instanceof Error?e.message:'Please try again.');}finally{setBusy(false);}
 }
 async function handleLocation(){if(busy)return;setBusy(true);setError('');const found=await position();setBusy(false);if(!found){setError('A precise location is unavailable. Please enter your pickup address.');return;}setGPS(found);await send(started?'message':'start',started?'use my location':undefined,found);}
 function dictate(){
  if(listening){recognition.current?.stop();return;}
  const api=window as unknown as SpeechWindow,Constructor=api.SpeechRecognition||api.webkitSpeechRecognition;if(!Constructor)return;
  const r=new Constructor();r.lang='en-GB';r.interimResults=false;r.onresult=e=>setText(e.results[e.resultIndex][0].transcript);r.onerror=()=>{setListening(false);setError('Dictation is unavailable. You can type or use your keyboard microphone.');};r.onend=()=>setListening(false);recognition.current=r;
  try{r.start();setListening(true);}catch{setListening(false);}
 }
 function submit(e:FormEvent){e.preventDefault();if(text.trim())void send('message',text.trim());}
 const button='min-h-12 rounded-2xl border border-white/15 px-5 py-3 font-semibold transition disabled:opacity-40';
 return <main className="min-h-dvh bg-[#101719] px-5 py-8 text-white"><div className="mx-auto max-w-xl">
  <Link href="/" className="text-sm font-semibold tracking-widest text-[#d3bf83]">NEED A CAB PLUS</Link>
  <div className="mt-8 flex items-center justify-between gap-3"><h1 className="text-3xl font-semibold">Let’s book your taxi</h1><span className="rounded-full border border-[#d3bf83]/40 px-3 py-1 text-xs text-[#d3bf83]">Preview</span></div>
  <p className="mt-3 text-sm text-white/60">Cash fares from Autocab. This preview will not send a taxi.</p>
  <section aria-live="polite" className="mt-8 rounded-3xl border border-white/15 bg-white/5 p-6"><p className="text-xl leading-relaxed">{speech}</p></section>
  {error&&<p role="alert" className="mt-4 rounded-xl bg-amber-100 p-4 text-sm text-amber-950">{error}</p>}
  {!started||ended?<button disabled={busy} onClick={()=>void send(started?'reset':'start')} className={button+' mt-6 w-full bg-[#d3bf83] text-[#101719]'}>{busy?'One moment…':started?'Start another test':'Start booking'}</button>:<>
   <form onSubmit={submit} className="mt-6"><label htmlFor="reply" className="text-sm text-white/70">Your reply</label><textarea id="reply" value={text} onChange={e=>setText(e.target.value)} disabled={busy} maxLength={330} rows={3} inputMode={field==='phone'?'tel':'text'} placeholder={field==='phone'?'Your phone number':field==='name'?'Your name':'Book me a taxi to the train station'} className="mt-2 w-full rounded-2xl border border-white/20 bg-[#1e282b] p-4 text-lg focus:outline-2 focus:outline-[#d3bf83]"/>
    <div className="mt-3 flex gap-3"><button type="submit" disabled={busy||!text.trim()} className={button+' flex-1 bg-[#d3bf83] text-[#101719]'}>{busy?'One moment…':'Send reply'}</button>{canDictate&&<button type="button" disabled={busy} onClick={dictate} aria-pressed={listening} className={button}>{listening?'Stop listening':'Dictate'}</button>}</div>
   </form><div className="mt-3 grid grid-cols-2 gap-3"><button disabled={busy} onClick={()=>void send('message','yes')} className={button}>Yes</button><button disabled={busy} onClick={()=>void send('message','no')} className={button}>No</button></div>
   <button disabled={busy} onClick={()=>void send('message','stop')} className="mt-4 w-full py-3 text-sm text-white/60">Cancel this request</button>
  </>}
  {!ended&&<button disabled={busy} onClick={()=>void handleLocation()} className={button+' mt-4 w-full'}>Use current location</button>}
  <label className="mt-6 flex items-center gap-3 text-sm text-white/65"><input type="checkbox" checked={readReplies} onChange={e=>setReadReplies(e.target.checked)} className="size-5"/>Read replies aloud</label>
  <p className="mt-4 text-xs leading-relaxed text-white/45">Dictation depends on your browser. You can also type or use your keyboard’s microphone. Review your reply before sending.</p>
 </div></main>;
}
