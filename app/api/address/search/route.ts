import {z} from 'zod';
import {unavailable} from '@/lib/security';

export const dynamic='force-dynamic';
const querySchema=z.string().trim().min(2).max(160);

export async function GET(request:Request){
 try{
  const query=querySchema.parse(new URL(request.url).searchParams.get('q')||'');
  const origin=(process.env.ADDRESS_LOOKUP_ORIGIN||'https://webapp.needacab.uk').replace(/\/$/,'');
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);
  try{
   const response=await fetch(`${origin}/api/address/lookup?text=${encodeURIComponent(query)}`,{headers:{Accept:'application/json'},cache:'no-store',signal:controller.signal});
   if(!response.ok)return Response.json({error:'Address search is temporarily unavailable.'},{status:502});
   const raw=await response.json() as unknown,items=Array.isArray(raw)?raw:[];
   return Response.json({items:items.slice(0,8)},{headers:{'Cache-Control':'no-store'}});
  }finally{clearTimeout(timer)}
 }catch(error){if(error instanceof z.ZodError)return Response.json({items:[]});return unavailable(error)}
}
