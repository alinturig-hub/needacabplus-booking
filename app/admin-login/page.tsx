'use client';
import {FormEvent,useState} from 'react';
import {ArrowRight,LockKeyhole} from 'lucide-react';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';

export default function AdminLogin(){
 const router=useRouter();
 const [email,setEmail]=useState('admin@needacabplus.app');
 const [password,setPassword]=useState('');
 const [error,setError]=useState('');
 const [busy,setBusy]=useState(false);
 async function submit(event:FormEvent){
  event.preventDefault();setBusy(true);setError('');
  try{const response=await fetch('/api/admin/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password})});const data=await response.json() as {error?:string};if(!response.ok)throw new Error(data.error);router.push('/admin');router.refresh()}
  catch(reason){setError(reason instanceof Error?reason.message:'Unable to sign in.')}
  finally{setBusy(false)}
 }
 return <main className="login-shell"><section className="login-card"><Link className="brand login-brand" href="/"><span className="brandmark">N<span>+</span></span><span>NEED A CAB <b>PLUS</b></span></Link><div className="login-icon"><LockKeyhole size={24}/></div><span className="eyebrow">CONTROL ROOM</span><h1>Admin sign in</h1><p className="muted">Use the private administrator account to manage bookings and tariffs.</p><form onSubmit={submit}><label>Email address<Input type="email" autoComplete="username" value={email} onChange={event=>setEmail(event.target.value)} required/></label><label>Password<Input type="password" autoComplete="current-password" value={password} onChange={event=>setPassword(event.target.value)} required autoFocus/></label>{error&&<p className="error-message" role="alert">{error}</p>}<Button type="submit" className="primary-action" disabled={busy}>{busy?'Signing in…':'Sign in'}<ArrowRight size={18}/></Button></form><Link className="text-link" href="/">← Back to customer app</Link></section></main>;
}
