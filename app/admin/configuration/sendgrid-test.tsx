'use client';
import {useState} from 'react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';

export default function SendGridTest(){
 const [email,setEmail]=useState(''),[busy,setBusy]=useState(false),[result,setResult]=useState('');
 async function send(event:React.FormEvent){event.preventDefault();if(busy)return;setBusy(true);setResult('');try{const response=await fetch('/api/admin/sendgrid-test',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email})});const data=await response.json() as {error?:string;message?:string};setResult(response.ok?data.message||'SendGrid accepted the email.':data.error||'Unable to send the email.')}catch{setResult('The request could not be confirmed. Check the inbox before retrying.')}finally{setBusy(false)}}
 return <section className="customer-settings-group"><header><h4>Test SendGrid</h4><p>Save the settings above before sending. SendGrid may charge for this email.</p></header><form onSubmit={send} className="settings-grid customer-fields-grid"><label className="customer-setting-field" htmlFor="sendgrid-test-email"><span>Recipient email</span><Input id="sendgrid-test-email" type="email" required value={email} onChange={event=>setEmail(event.target.value)}/></label><Button type="submit" disabled={busy||!email.trim()}>{busy?'Sending…':'Send test email'}</Button></form>{result&&<p role="status">{result}</p>}</section>;
}
