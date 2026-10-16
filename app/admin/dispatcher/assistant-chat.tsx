'use client';

import Link from 'next/link';
import {useEffect,useRef,useState,type FormEvent} from 'react';
import {ArrowUp,LoaderCircle,MessageSquareText,RotateCcw,Sparkles,X} from 'lucide-react';
import styles from './assistant-chat.module.css';

type Message={role:'user'|'assistant';content:string};
type AnswerPayload={answer?:string;error?:string;checkedAt?:string;bookingSource?:string;driverSource?:string};
const prompts=['What needs attention now?','Which bookings are due soon?','How many drivers are clear?','What should I check before dispatching?'];

function LinkedAnswer({text}:{text:string}){
 return <>{text.split(/(\[[^\]]+\]\(\/dispatch[^)]*\))/g).map((part,index)=>{
  const match=/^\[([^\]]+)\]\((\/dispatch[^)]*)\)$/.exec(part);
  return match?<Link key={index} href={match[2]}>{match[1]}</Link>:<span key={index}>{part}</span>;
 })}</>;
}

export default function DispatchAssistantChat({bookingId,driverId}:{bookingId?:string;driverId?:string}){
 const [open,setOpen]=useState(false);
 const [ready,setReady]=useState<boolean|null>(null);
 const [messages,setMessages]=useState<Message[]>([]);
 const [question,setQuestion]=useState('');
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [checkedAt,setCheckedAt]=useState('');
 const [sources,setSources]=useState<{booking:string;driver:string}|null>(null);
 const field=useRef<HTMLTextAreaElement>(null),end=useRef<HTMLDivElement>(null),trigger=useRef<HTMLButtonElement>(null);

 useEffect(()=>{
  if(!open)return;
  let active=true;
  fetch('/api/dispatch/assistant',{cache:'no-store'}).then(async response=>{const data=await response.json() as {ready?:boolean;error?:string};if(!response.ok)throw new Error(data.error||'Assistant unavailable.');if(active)setReady(Boolean(data.ready))}).catch(cause=>{if(active)setError(cause instanceof Error?cause.message:'Assistant unavailable.')});
  field.current?.focus();
  const onKey=(event:KeyboardEvent)=>{if(event.key==='Escape')setOpen(false)};
  document.addEventListener('keydown',onKey);
  return()=>{active=false;document.removeEventListener('keydown',onKey)};
 },[open]);
 useEffect(()=>{if(open)end.current?.scrollIntoView({block:'end',behavior:'smooth'})},[messages,busy,open]);

 async function ask(text:string){
  const message=text.trim();if(!message||busy||!ready)return;
  const history=messages.slice(-8).map(item=>({...item,content:item.content.slice(0,2000)}));
  setMessages(current=>[...current,{role:'user',content:message}]);setQuestion('');setBusy(true);setError('');
  try{
   const response=await fetch('/api/dispatch/assistant',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message,history,focus:{...(bookingId?{bookingId}:{}),...(driverId?{driverId}:{})}})});
   const data=await response.json() as AnswerPayload;
   if(!response.ok)throw new Error(data.error||'The assistant could not respond.');
   setMessages(current=>[...current,{role:'assistant',content:data.answer||'No answer was returned.'}]);
   setCheckedAt(data.checkedAt||'');setSources({booking:data.bookingSource||'unavailable',driver:data.driverSource||'unavailable'});
  }catch(cause){setError(cause instanceof Error?cause.message:'The assistant could not respond.')}finally{setBusy(false);field.current?.focus()}
 }

 function close(){setOpen(false);trigger.current?.focus()}
 return <div className={styles.root}>
  {!open&&<button ref={trigger} className={styles.launcher} type="button" onClick={()=>setOpen(true)} aria-label="Open Dispatch AI chat"><Sparkles size={20}/><span>Ask AI</span></button>}
  {open&&<section className={styles.panel} role="dialog" aria-label="Dispatch AI assistant">
   <header><div className={styles.title}><span><Sparkles size={19}/></span><div><strong>Dispatch AI</strong><small>Live operational assistant</small></div></div><div className={styles.actions}><button type="button" onClick={()=>{setMessages([]);setCheckedAt('');setError('')}} disabled={!messages.length||busy} aria-label="Clear conversation"><RotateCcw size={17}/></button><button type="button" onClick={close} aria-label="Close assistant"><X size={20}/></button></div></header>
   <div className={styles.feed} aria-live="polite">
    {!messages.length&&<div className={styles.welcome}><MessageSquareText size={29}/><h2>How can I help?</h2><p>Ask about the current booking queue or driver status. Data is refreshed when you send a question.</p><div className={styles.prompts}>{prompts.map(prompt=><button type="button" key={prompt} onClick={()=>setQuestion(prompt)}>{prompt}</button>)}</div></div>}
    {messages.map((item,index)=><div key={index} className={`${styles.message} ${item.role==='user'?styles.user:styles.assistant}`}><small>{item.role==='user'?'You':'Assistant'}</small><p>{item.role==='assistant'?<LinkedAnswer text={item.content}/>:item.content}</p></div>)}
    {busy&&<div className={`${styles.message} ${styles.assistant}`}><small>Assistant</small><p><LoaderCircle size={16} className={styles.spin}/> Checking live feeds…</p></div>}
    <div ref={end}/>
   </div>
   {checkedAt&&<div className={styles.freshness}>Checked {new Date(checkedAt).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit',second:'2-digit'})} · Bookings: {sources?.booking} · Drivers: {sources?.driver}</div>}
   {ready===false&&<p className={styles.notice}>An Admin must configure and enable AI Assistant in Admin settings.</p>}
   {error&&<p className={styles.error} role="alert">{error}</p>}
   <form className={styles.composer} onSubmit={(event:FormEvent)=>{event.preventDefault();void ask(question)}}><label htmlFor="dispatch-ai-question">Ask about live operations</label><div><textarea ref={field} id="dispatch-ai-question" value={question} onChange={event=>setQuestion(event.target.value)} onKeyDown={event=>{if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();void ask(question)}}} placeholder={ready===false?'Ask an Admin to enable AI Assistant':'Ask what needs attention…'} maxLength={2000} rows={2} disabled={!ready||busy}/><button type="submit" disabled={!ready||busy||!question.trim()} aria-label="Send question"><ArrowUp size={18}/></button></div><small>Suggestions only. Verify the live record before taking action.</small></form>
  </section>}
 </div>;
}
