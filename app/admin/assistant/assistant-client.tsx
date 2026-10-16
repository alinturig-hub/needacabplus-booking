'use client';

import Link from 'next/link';
import {useEffect,useRef,useState,type FormEvent} from 'react';
import {ArrowUp,BookOpen,CarFront,KeyRound,LoaderCircle,MessageSquareText,RotateCcw,Settings2,Sparkles,UsersRound} from 'lucide-react';
import './assistant.css';

type Message={role:'user'|'assistant';content:string};
type Config={enabled:boolean;model:'gpt-4.1-mini'|'gpt-4.1'|'gpt-4o-mini';keyConfigured:boolean;keySource:'admin'|'environment'|'none'};
const examples=['How many drivers are active or suspended?','Find bookings for a passenger or reference','Find a driver by name or callsign','Which vehicles match a registration?'];

function Answer({content}:{content:string}){
 const pieces=content.split(/(\[[^\]]+\]\(\/(?:admin|dispatch)[^)]*\))/g);
 return <>{pieces.map((piece,index)=>{
  const match=/^\[([^\]]+)\]\((\/(?:admin|dispatch)[^)]*)\)$/.exec(piece);
  return match?<Link key={index} href={match[2]}>{match[1]}</Link>:<span key={index}>{piece}</span>;
 })}</>;
}

export default function AssistantClient(){
 const [config,setConfig]=useState<Config|null>(null);
 const [configError,setConfigError]=useState('');
 const [settingsOpen,setSettingsOpen]=useState(false);
 const [apiKey,setApiKey]=useState('');
 const [saving,setSaving]=useState(false);
 const [messages,setMessages]=useState<Message[]>([]);
 const [question,setQuestion]=useState('');
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const endRef=useRef<HTMLDivElement>(null);

 useEffect(()=>{let live=true;fetch('/api/admin/assistant/config',{cache:'no-store'}).then(async response=>{
  const data=await response.json() as Config&{error?:string};if(!response.ok)throw new Error(data.error||'Unable to load settings.');if(live)setConfig(data);
 }).catch(cause=>{if(live)setConfigError(cause instanceof Error?cause.message:'Unable to load settings.')});return()=>{live=false}},[]);
 useEffect(()=>{endRef.current?.scrollIntoView({behavior:'smooth',block:'end'})},[messages,busy]);

 async function saveSettings(event:FormEvent<HTMLFormElement>){
  event.preventDefault();if(!config)return;setSaving(true);setConfigError('');
  try{const response=await fetch('/api/admin/assistant/config',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({enabled:config.enabled,model:config.model,...(apiKey.trim()?{apiKey:apiKey.trim()}:{})})});const data=await response.json() as Config&{error?:string};if(!response.ok)throw new Error(data.error||'Could not save settings.');setConfig(data);setApiKey('');setSettingsOpen(false)}catch(cause){setConfigError(cause instanceof Error?cause.message:'Could not save settings.')}finally{setSaving(false)}
 }
 async function send(text:string){
  const trimmed=text.trim();if(!trimmed||busy||!config?.enabled||!config.keyConfigured)return;
  const history=messages.slice(-8).map(item=>({...item,content:item.content.slice(0,2000)}));setMessages(current=>[...current,{role:'user',content:trimmed}]);setQuestion('');setBusy(true);setError('');
  try{const response=await fetch('/api/admin/assistant/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:trimmed,history})});const data=await response.json() as {answer?:string;error?:string};if(!response.ok)throw new Error(data.error||'The assistant could not respond.');setMessages(current=>[...current,{role:'assistant',content:data.answer||'No answer was returned.'}])}catch(cause){setError(cause instanceof Error?cause.message:'The assistant could not respond.')}finally{setBusy(false)}
 }

 return <main className="ai-page">
  <div className="ai-intro"><div className="ai-icon"><Sparkles size={27}/></div><div><span className="ai-eyebrow">ADMIN WORKSPACE</span><h1>AI Assistant</h1><p>Ask about bookings, drivers and vehicles using the records already available in Admin.</p></div></div>
  <div className="ai-layout">
   <section className="ai-chat" aria-label="Assistant conversation">
    <div className="ai-chat-head"><div><MessageSquareText size={19}/><strong>Conversation</strong></div><button type="button" onClick={()=>{setMessages([]);setError('')}} disabled={!messages.length||busy}><RotateCcw size={15}/> Clear</button></div>
    <div className="ai-messages" aria-live="polite">
     {!messages.length&&<div className="ai-empty"><Sparkles size={35}/><h2>What would you like to find?</h2><p>Ask a question or choose an example. The assistant searches records only when needed.</p><div className="ai-examples">{examples.map(example=><button type="button" key={example} onClick={()=>setQuestion(example)}>{example}</button>)}</div></div>}
     {messages.map((message,index)=><div key={index} className={`ai-bubble ${message.role}`}><span>{message.role==='user'?'You':'Assistant'}</span><p>{message.role==='assistant'?<Answer content={message.content}/>:message.content}</p></div>)}
     {busy&&<div className="ai-bubble assistant"><span>Assistant</span><p><LoaderCircle size={17} className="ai-spin"/> Searching records…</p></div>}
     <div ref={endRef}/>
    </div>
    {error&&<p className="ai-error" role="alert">{error}</p>}
    <form className="ai-composer" onSubmit={event=>{event.preventDefault();void send(question)}}><label htmlFor="ai-question">Ask a question</label><div><textarea id="ai-question" value={question} onChange={event=>setQuestion(event.target.value)} placeholder={config?.enabled?'Ask about a booking, driver or vehicle…':'Configure and enable the assistant to begin.'} maxLength={2000} rows={2} disabled={!config?.enabled||!config.keyConfigured||busy} onKeyDown={event=>{if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();void send(question)}}}/><button type="submit" aria-label="Send question" disabled={!question.trim()||busy||!config?.enabled||!config.keyConfigured}>{busy?<LoaderCircle size={18} className="ai-spin"/>:<ArrowUp size={18}/>}</button></div><small>Read only. Answers may be incomplete; check the source record before acting.</small></form>
   </section>
   <aside className="ai-side"><div className="ai-side-card"><div className="ai-side-heading"><Settings2 size={20}/><h2>Setup</h2></div><p>The assistant needs an OpenAI API key. Only relevant record fields and your question are sent to OpenAI.</p><div className="ai-state"><span className={config?.enabled&&config.keyConfigured?'ready':''}/>{config?.enabled&&config.keyConfigured?'Ready':config?.keyConfigured?'Paused':'Not configured'}</div><button className="ai-settings-toggle" type="button" onClick={()=>setSettingsOpen(value=>!value)}><KeyRound size={17}/>{settingsOpen?'Hide settings':'Configure assistant'}</button>
    {settingsOpen&&<form className="ai-settings" onSubmit={saveSettings}><label>OpenAI API key<input type="password" autoComplete="new-password" value={apiKey} onChange={event=>setApiKey(event.target.value)} placeholder={config?.keyConfigured?'Key saved — enter to replace':'sk-…'}/></label><label>Model<select value={config?.model||'gpt-4.1-mini'} onChange={event=>setConfig(current=>current?{...current,model:event.target.value as Config['model']}:current)}><option value="gpt-4.1-mini">GPT-4.1 mini</option><option value="gpt-4.1">GPT-4.1</option><option value="gpt-4o-mini">GPT-4o mini</option></select></label><label className="ai-enable"><input type="checkbox" checked={config?.enabled||false} onChange={event=>setConfig(current=>current?{...current,enabled:event.target.checked}:current)}/> Enable assistant</label><button type="submit" disabled={!config||saving}>{saving?'Saving…':'Save settings'}</button></form>}
    {configError&&<p className="ai-error" role="alert">{configError}</p>}
   </div><div className="ai-side-card"><div className="ai-side-heading"><BookOpen size={20}/><h2>Data sources</h2></div><Link href="/admin/bookings"><BookOpen size={17}/> Bookings</Link><Link href="/admin/drivers"><UsersRound size={17}/> Drivers</Link><Link href="/admin/vehicles"><CarFront size={17}/> Fleet Management</Link><p>Local and synchronized Autocab fleet records are identified separately in answers.</p></div></aside>
  </div>
 </main>;
}
