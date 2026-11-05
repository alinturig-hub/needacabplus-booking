'use client';
import {useEffect,useState} from 'react';
export default function NativeAuthComplete(){
 const [link,setLink]=useState('');
 // The fragment is external browser state; synchronize it once after hydration.
 useEffect(()=>{
  const params=new URLSearchParams(location.hash.slice(1)),code=params.get('code')||'',state=params.get('state')||'';
  history.replaceState(history.state,'',location.pathname); // Remove the short-lived grant from browser history.
  if(!/^[A-Za-z0-9_-]{43}$/.test(code)||!/^[A-Za-z0-9_-]{43}$/.test(state))return;
  const target=`intent://auth/complete?${new URLSearchParams({code,state})}#Intent;scheme=needacabplus-test;package=app.needacabplus.passenger.testing;end`;
  // eslint-disable-next-line react-hooks/set-state-in-effect -- Synchronize the one-use browser fragment after hydration.
  setLink(target);
  try{location.href=target}catch{/* The explicit button remains available when automatic launch is blocked. */}
 },[]);
 return <main className="mobile-auth-shell"><section className="mobile-auth-card"><h1>Return to Need A Cab Plus</h1><p>Finish signing in inside the app. If it did not open automatically, tap below.</p>{link?<a className="mobile-login-button" href={link}>Return to app</a>:<p>Start Google sign-in from the app to get a new return link.</p>}</section></main>;
}
