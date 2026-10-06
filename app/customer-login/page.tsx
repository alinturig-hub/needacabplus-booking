'use client';

import {FormEvent,Suspense,useEffect,useRef,useState} from 'react';
import {useRouter,useSearchParams} from 'next/navigation';
import Link from 'next/link';
import {ArrowLeft} from 'lucide-react';
import {oauthMessages} from '@/lib/oauth-errors';

type AuthResponse={error?:string;verificationRequired?:boolean;phoneRequired?:boolean;phone?:string;maskedPhone?:string;expiresIn?:number};

function CustomerLoginForm(){
 const router=useRouter(),params=useSearchParams(),codeInput=useRef<HTMLInputElement>(null);
 const startsWithVerification=params.get('verify')==='1'&&params.get('phone')!=='1';
 const [stage,setStage]=useState<'number'|'code'>(startsWithVerification?'code':'number');
 const [phone,setPhone]=useState(''),[sentTo,setSentTo]=useState(''),[code,setCode]=useState('');
 const oauthError=params.get('error');
 const [busy,setBusy]=useState(false),[error,setError]=useState(oauthError?(oauthMessages[oauthError]||oauthMessages.provider):''),[providers,setProviders]=useState({google:false,apple:false});
 const [resendIn,setResendIn]=useState(startsWithVerification?30:0);

 useEffect(()=>{fetch('/api/customer/auth/options',{cache:'no-store'}).then(r=>r.json() as Promise<{google:boolean;apple:boolean}>).then(setProviders).catch(()=>{})},[]);
 useEffect(()=>{if(resendIn<=0)return;const timer=window.setInterval(()=>setResendIn(value=>Math.max(0,value-1)),1000);return()=>window.clearInterval(timer)},[resendIn]);
 useEffect(()=>{if(stage==='code')codeInput.current?.focus()},[stage]);

 function finish(){const value=params.get('returnTo'),target=value?.startsWith('/')&&!value.startsWith('//')&&!value.includes('\\')?value:'/';router.replace(target);router.refresh()}
 function displayNumber(value:string){return value.startsWith('+44')?`+44 ${value.slice(3)}`:value}
 function submittedNumber(){const value=phone.replace(/[ ()-]/g,'');return value.startsWith('+')||value.startsWith('00')?value:`+44${value.replace(/^0/,'')}`}

 async function request(action:string,body:unknown){
  setBusy(true);setError('');
  try{
   const response=await fetch(`/api/customer/auth/${action}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),data=await response.json() as AuthResponse;
   if(!response.ok)throw new Error(data.error||'Unable to continue. Please try again.');
   if(data.verificationRequired){setStage(data.phoneRequired?'number':'code');setCode('');setSentTo(current=>data.phone||current||submittedNumber());setResendIn(data.expiresIn||30)}else finish();
  }catch(reason){setError(reason instanceof Error?reason.message:'Unable to continue. Please try again.')}finally{setBusy(false)}
 }
 function submitPhone(event:FormEvent){event.preventDefault();void request(params.get('phone')==='1'?'phone':'mobile',{phone:submittedNumber()})}
 function updateCode(value:string){const next=value.replace(/\D/g,'').slice(0,4);setCode(next);if(next.length===4&&!busy)void request('verify',{code:next})}
 function restart(){setStage('number');setCode('');setError('');setResendIn(0)}

 if(stage==='code')return <main className="mobile-auth-shell"><section className="mobile-auth-card mobile-code-card">
  <button className="mobile-auth-back" type="button" aria-label="Back" onClick={restart}><ArrowLeft/></button>
  <div className="mobile-code-content"><h1>Enter the code</h1><p>An SMS code was sent to <strong>{sentTo?displayNumber(sentTo):'your mobile'}</strong></p>
   <label className="otp-entry" aria-label="Four-digit verification code"><input ref={codeInput} value={code} onChange={event=>updateCode(event.target.value)} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={4}/><span className="otp-cells" aria-hidden="true">{[0,1,2,3].map(index=><span className={index===Math.min(code.length,3)?'active':''} key={index}>{code[index]||''}</span>)}</span></label>
   {busy&&<p className="mobile-auth-status" role="status">Checking code…</p>}
   {error&&<p className="mobile-auth-error" role="alert">{error}</p>}
   {resendIn>0?<p className="mobile-resend">Resend code in <strong>{resendIn}</strong></p>:<button className="mobile-resend-button" disabled={busy} onClick={()=>void request('resend',{})}>Resend code</button>}
  </div>
 </section></main>;

 const hasSocial=providers.google||providers.apple;
 return <main className="mobile-auth-shell"><section className="mobile-auth-card mobile-number-card">
  <div className="mobile-auth-brand" aria-label="Need A Cab Plus"><span>N+</span><strong>NEED A CAB PLUS</strong></div>
  <div className="mobile-number-content"><h1>Enter your number</h1><form onSubmit={submitPhone}>
   <label className="mobile-phone-field"><span className="phone-flag" aria-hidden="true">🇬🇧</span><span className="phone-chevron" aria-hidden="true">⌄</span><span className="phone-prefix">+44</span><input required aria-label="Mobile number" type="tel" inputMode="tel" autoComplete="tel-national" placeholder="7713702869" value={phone} onChange={event=>setPhone(event.target.value)} /></label>
   {error&&<p className="mobile-auth-error" role="alert">{error}</p>}
   <button className="mobile-login-button" disabled={busy}>{busy?'Sending code…':'Log In'}</button>
  </form>
  {hasSocial&&<><div className="mobile-auth-or"><span/>Or<span/></div><div className="mobile-socials">
   {providers.google&&<Link prefetch={false} href="/api/customer/auth/oauth/google"><span className="google-mark">G</span>Sign in with Google</Link>}
   {providers.apple&&<Link prefetch={false} href="/api/customer/auth/oauth/apple"><span className="apple-mark">●</span>Sign in with Apple</Link>}
  </div></>}
  </div>
  <p className="mobile-auth-legal">By continuing, you agree to our <Link href="/terms">Terms &amp; Conditions</Link>, acknowledge our <Link href="/privacy">Privacy Policy</Link>, and confirm that you are over 18. We may send messages related to your journeys.</p>
 </section></main>;
}

export default function CustomerLogin(){return <Suspense fallback={<main className="mobile-auth-shell"/>}><CustomerLoginForm/></Suspense>}
