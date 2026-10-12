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
 async function submit(event:FormEvent){
  event.preventDefault();setBusy(true);setError('');
  // A full navigation guarantees the browser commits the session cookie before loading the protected page.
  try{const response=await fetch('/api/admin/login',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password})});const data=await response.json() as {error?:string};if(!response.ok)throw new Error(data.error);window.location.href=destination}
  catch(reason){setError(reason instanceof Error?reason.message:'Unable to sign in.')}
  finally{setBusy(false)}
 }
 return <main className="login-shell"><section className="login-card"><Link className="brand login-brand" href="/"><span className="brandmark">N<span>+</span></span><span>NEED A CAB <b>PLUS</b></span></Link><div className="login-icon"><LockKeyhole size={24}/></div><span className="eyebrow">CONTROL ROOM</span><h1>{destination==='/dispatch'?'Dispatch sign in':'Admin sign in'}</h1><p className="muted">{destination==='/dispatch'?'Use the administrator account until dispatcher roles are configured.':'Use the private administrator account to manage bookings and tariffs.'}</p><form onSubmit={submit}><label>Email address<Input type="email" autoComplete="username" value={email} onChange={event=>setEmail(event.target.value)} required/></label><label>Password<Input type="password" autoComplete="current-password" value={password} onChange={event=>setPassword(event.target.value)} required autoFocus/></label>{error&&<p className="error-message" role="alert">{error}</p>}<Button type="submit" className="primary-action" disabled={busy}>{busy?'Signing in…':'Sign in'}<ArrowRight size={18}/></Button></form><Link className="text-link" href="https://webapp.needacabplus.app/">← Back to customer app</Link></section></main>;
}
