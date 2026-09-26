'use client';
import Link from 'next/link';
import {FormEvent,Suspense,useState} from 'react';
import {useRouter,useSearchParams} from 'next/navigation';
import {ArrowRight,LockKeyhole,UserPlus} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';

function CustomerLoginForm(){
 const router=useRouter(),params=useSearchParams(),[mode,setMode]=useState<'login'|'register'>('login'),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[fullName,setFullName]=useState(''),[phone,setPhone]=useState('');
 async function submit(event:FormEvent){event.preventDefault();setBusy(true);setError('');try{const response=await fetch(`/api/customer/auth/${mode}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(mode==='login'?{email,password}:{email,password,fullName,phone})}),data=await response.json() as {error?:string};if(!response.ok)throw new Error(data.error||'Unable to continue.');const returnTo=params.get('returnTo');router.push(returnTo?.startsWith('/')&&!returnTo.startsWith('//')?returnTo:'/');router.refresh()}catch(reason){setError(reason instanceof Error?reason.message:'Unable to continue.')}finally{setBusy(false)}}
 return <main className="customer-auth-shell"><section className="customer-auth-card"><Link className="brand login-brand" href="/"><span className="brandmark">N<span>+</span></span><span>NEED A CAB <b>PLUS</b></span></Link><div className="login-icon">{mode==='login'?<LockKeyhole/>:<UserPlus/>}</div><span className="eyebrow">CUSTOMER ACCOUNT</span><h1>{mode==='login'?'Welcome back.':'Create your account.'}</h1><p className="muted">{mode==='login'?'Sign in to book and manage your journeys.':'Save your card securely and book faster.'}</p><div className="customer-auth-tabs"><button className={mode==='login'?'active':''} onClick={()=>{setMode('login');setError('')}}>Sign in</button><button className={mode==='register'?'active':''} onClick={()=>{setMode('register');setError('')}}>Create account</button></div><form onSubmit={submit}>{mode==='register'&&<><label>Full name<Input required minLength={2} autoComplete="name" value={fullName} onChange={e=>setFullName(e.target.value)}/></label><label>Mobile number<Input required type="tel" autoComplete="tel" value={phone} onChange={e=>setPhone(e.target.value)}/></label></>}<label>Email address<Input required type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)}/></label><label>Password<Input required minLength={mode==='register'?10:1} type="password" autoComplete={mode==='login'?'current-password':'new-password'} value={password} onChange={e=>setPassword(e.target.value)}/></label>{mode==='register'&&<small className="password-help">Use at least 10 characters.</small>}{error&&<p className="error-message">{error}</p>}<Button className="primary-action" disabled={busy}>{busy?'Please wait…':mode==='login'?'Sign in':'Create account'}<ArrowRight/></Button></form><Link className="text-link" href="/">← Back to booking</Link></section></main>
}

export default function CustomerLogin(){
 return <Suspense fallback={<main className="customer-auth-shell"><section className="customer-auth-card"><p className="muted">Loading…</p></section></main>}><CustomerLoginForm/></Suspense>
}
