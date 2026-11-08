import {verify,X509Certificate} from 'node:crypto';
import {z} from 'zod';
export const topics=new Set(['activity','permit','section-58'].map(name=>`arn:aws:sns:eu-west-2:287813576808:prod-${name}-topic`));
export const envelopeSchema=z.object({Type:z.enum(['Notification','SubscriptionConfirmation','UnsubscribeConfirmation']),MessageId:z.string().min(1).max(200),TopicArn:z.string().refine(value=>topics.has(value)),Message:z.string().max(262144),Timestamp:z.string().datetime({offset:true}),SignatureVersion:z.enum(['1','2']),Signature:z.string().min(1).max(8192),SigningCertURL:z.string().url(),Subject:z.string().max(1000).optional(),Token:z.string().min(1).max(4096).optional()}).passthrough();
export type SnsEnvelope=z.infer<typeof envelopeSchema>;
export function certificateUrl(value:string){
 const url=new URL(value);
 if(url.protocol!=='https:'||url.hostname!=='sns.eu-west-2.amazonaws.com'||url.port||url.username||url.password||url.search||url.hash||!/^\/SimpleNotificationService-[a-zA-Z0-9_-]+\.pem$/.test(url.pathname))throw Error('UNTRUSTED_CERTIFICATE_URL');
 return url;
}
export function signingText(envelope:SnsEnvelope){
 const keys=envelope.Type==='Notification'?['Message','MessageId',...(envelope.Subject!==undefined?['Subject']:[]),'Timestamp','TopicArn','Type']:['Message','MessageId','SubscribeURL','Timestamp','Token','TopicArn','Type'];
 // SNS signs SubscribeURL for confirmation messages. It is not followed by this receiver.
 return keys.map(key=>{const value=envelope[key];if(typeof value!=='string')throw Error('MISSING_SIGNED_FIELD');return `${key}\n${value}\n`}).join('');
}
export async function boundedText(response:Response,limit:number){
 const reader=response.body?.getReader();if(!reader)throw Error('EMPTY_BODY');let bytes=0;const parts:Uint8Array[]=[];
 for(;;){const part=await reader.read();if(part.done)break;bytes+=part.value.byteLength;if(bytes>limit){await reader.cancel();throw Error('BODY_TOO_LARGE')}parts.push(part.value)}
 return Buffer.concat(parts).toString('utf8');
}
export function checkSignature(envelope:SnsEnvelope,key:Parameters<typeof verify>[2]){
 if(!verify(envelope.SignatureVersion==='2'?'RSA-SHA256':'RSA-SHA1',Buffer.from(signingText(envelope)),key,Buffer.from(envelope.Signature,'base64')))throw Error('INVALID_SIGNATURE');
}
const certificates=new Map<string,{pem:string;until:number}>();
export async function verifyEnvelope(envelope:SnsEnvelope){
 const url=certificateUrl(envelope.SigningCertURL).href;let entry=certificates.get(url);
 if(!entry||entry.until<Date.now()){
  const response=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(5000),cache:'no-store'});if(!response.ok)throw Error('CERTIFICATE_UNAVAILABLE');
  const pem=await boundedText(response,16384),cert=new X509Certificate(pem);
  if(cert.publicKey.asymmetricKeyType!=='rsa'||Date.now()<Date.parse(cert.validFrom)||Date.now()>Date.parse(cert.validTo))throw Error('INVALID_CERTIFICATE');
  entry={pem,until:Math.min(Date.now()+3600000,Date.parse(cert.validTo))};if(certificates.size>=8)certificates.clear();certificates.set(url,entry);
 }
 checkSignature(envelope,new X509Certificate(entry.pem).publicKey);
}
export function confirmationUrl(envelope:SnsEnvelope){
 if(envelope.Type!=='SubscriptionConfirmation'||!envelope.Token||!topics.has(envelope.TopicArn))throw Error('INVALID_CONFIRMATION');
 const url=new URL('https://sns.eu-west-2.amazonaws.com/');url.search=new URLSearchParams({Action:'ConfirmSubscription',TopicArn:envelope.TopicArn,Token:envelope.Token}).toString();return url;
}
export const eventSchema=z.object({event_reference:z.union([z.number().int(),z.string().min(1)]),event_type:z.string().min(1).max(200),event_time:z.string().datetime({offset:true}),object_type:z.string().min(1).max(100),object_reference:z.string().min(1).max(300),version:z.number().int(),object_data:z.record(z.unknown())}).passthrough();
