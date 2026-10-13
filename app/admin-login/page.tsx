'use client';
import {FormEvent,useState} from 'react';
import {ArrowRight,LockKeyhole} from 'lucide-react';
import Link from 'next/link';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';

export default function AdminLogin({destination='/admin'}:{destination?:'/admin'|'/dispatch'}){
 const [email,setEmail]=useState(destination==='/dispatch'?'':'admin@needacabplus.app');
 const [password,setPassword]=useState('');
 const [error,setError]=useState('');
 const [busy,setBusy]=useState(false);
 const [mfa,setMfa]=useState<{totp:boolean;sms:boolean;maskedPhone:string}|null>(null);
 const [method,setMethod]=useState<'totp'|'sms'>('totp');
 const [code,setCode]=useState('');
 const [sent,setSent]=useState(false);
 async function submit(event:FormEvent){
  event.preventDefault();setBusy(true);setError('');
  // A full navigation guarantees the browser commits the session cookie before loading the protected page.
  try{const response=await fetch('/api/admin/login',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password})});const data=await response.json() as {error?:string;mfaRequired?:boolean;totp?:boolean;sms?:boolean;maskedPhone?:string};if(!response.ok)throw new Error(data.error);if(data.mfaRequired){setMfa({totp:Boolean(data.totp),sms:Boolean(data.sms),maskedPhone:data.maskedPhone||''});setMethod(data.totp?'totp':'sms');setSent(!data.totp);setPassword('')}else window.location.href=destination}
  catch(reason){setError(reason instanceof Error?reason.message:'Unable to sign in.')}
  finally{setBusy(false)}
 }
 async function verify(event:FormEvent){event.preventDefault();setBusy(true);setError('');try{const response=await fetch('/api/admin/login/verify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'verify',method,code})});const data=await response.json() as {error?:string};if(!response.ok)throw new Error(data.error);window.location.href=destination}catch(reason){setError(reason instanceof Error?reason.message:'Unable to verify code.')}finally{setBusy(false)}}
 async function sendSms(){setBusy(true);setError('');try{const response=await fetch('/api/admin/login/verify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'sendSms'})});const data=await response.json() as {error?:string};if(!response.ok)throw new Error(data.error);setSent(true);setMethod('sms')}catch(reason){setError(reason instanceof Error?reason.message:'Unable to send code.')}finally{setBusy(false)}}
 return <main className="login-shell"><section className="login-card"><Link className="brand login-brand" href="/"><span className="brandmark">N<span>+</span></span><span>NEED A CAB <b>PLUS</b></span></Link><div className="login-icon"><LockKeyhole size={24}/></div><span className="eyebrow">CONTROL ROOM</span><h1>{mfa?'Verify sign in':destination==='/dispatch'?'Dispatch sign in':'Admin sign in'}</h1><p className="muted">{mfa?method==='sms'?`Enter the six-digit code sent to ${mfa.maskedPhone}.`:'Enter the six-digit code from your authenticator app.':destination==='/dispatch'?'Sign in with your Dispatcher or Admin account.':'Use the private administrator account to manage bookings and tariffs.'}</p>{!mfa?<form onSubmit={submit}><label>Email address<Input type="email" autoComplete="username" value={email} onChange={event=>setEmail(event.target.value)} required/></label><label>Password<Input type="password" autoComplete="current-password" value={password} onChange={event=>setPassword(event.target.value)} required autoFocus/></label>{error&&<p className="error-message" role="alert">{error}</p>}<Button type="submit" className="primary-action" disabled={busy}>{busy?'Signing in…':'Sign in'}<ArrowRight size={18}/></Button></form>:<form onSubmit={verify}><div className="admin-mfa-methods">{mfa.totp&&<button type="button" aria-pressed={method==='totp'} onClick={()=>{setMethod('totp');setCode('')}}>Authenticator</button>}{mfa.sms&&<button type="button" aria-pressed={method==='sms'} onClick={()=>{setMethod('sms');setCode('')}}>SMS</button>}</div>{method==='sms'&&!sent&&<Button type="button" onClick={sendSms} disabled={busy}>Send SMS code</Button>}<label>Verification code<Input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={code} onChange={event=>setCode(event.target.value.replace(/\D/g,''))} required autoFocus/></label>{error&&<p className="error-message" role="alert">{error}</p>}<Button type="submit" className="primary-action" disabled={busy||code.length!==6}>{busy?'Verifying…':'Verify and sign in'}<ArrowRight size={18}/></Button><button className="admin-mfa-back" type="button" onClick={()=>{setMfa(null);setCode('');setError('')}}>Back to sign in</button></form>}<Link className="text-link" href="https://webapp.needacabplus.app/">← Back to customer app</Link></section></main>;
}
