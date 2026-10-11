import {isAdmin,sameOrigin} from '@/lib/security';
import {taxiCrmBookingReadEnabled,taxiCrmDatabaseConfigured,TaxiCrmDatabaseConfigurationError,verifyTaxiCrmDatabase} from '@/lib/taxicrm-database';
import {inspectTaxiCrmBookingMapping,inspectTaxiCrmBookingSchema,readTaxiCrmBookings,TaxiCrmBookingSchemaError} from '@/lib/taxicrm-bookings';
import {taxiCrmClearDrivers,taxiCrmFleetFreshness} from '@/lib/taxicrm-live';
import {taxiCrmBookingStory,taxiCrmDispatchLive} from '@/lib/taxicrm-dispatch';
import {taxiCrmBookingLinkHealth} from '@/lib/taxicrm-customer-trips';

export const dynamic='force-dynamic';

export async function GET(request:Request){
 if(!await isAdmin())return Response.json({error:'Administrator access required.'},{status:403});
 const storyReference=new URL(request.url).searchParams.get('story');
 if(storyReference){if(!/^\d{1,20}$/.test(storyReference))return Response.json({error:'Invalid booking reference.'},{status:400});
  try{return Response.json(await taxiCrmBookingStory(storyReference),{headers:{'Cache-Control':'no-store'}})}
  catch(error){return Response.json({error:'TaxiCRM booking story preview failed.',code:error&&typeof error==='object'&&'code' in error?String(error.code):undefined},{status:502})}
 }
 if(new URL(request.url).searchParams.get('links')==='1'){
  try{return Response.json(await taxiCrmBookingLinkHealth(),{headers:{'Cache-Control':'no-store'}})}
  catch(error){return Response.json({error:'TaxiCRM booking link check failed.',code:error&&typeof error==='object'&&'code' in error?String(error.code):undefined},{status:502})}
 }
 if(new URL(request.url).searchParams.get('dispatch')==='1'){
  try{return Response.json(await taxiCrmDispatchLive(),{headers:{'Cache-Control':'no-store'}})}
  catch(error){return Response.json({error:'TaxiCRM dispatch preview failed.',code:error&&typeof error==='object'&&'code' in error?String(error.code):undefined},{status:502})}
 }
 if(new URL(request.url).searchParams.get('live')==='1'){
  try{const [drivers,fleet]=await Promise.all([taxiCrmClearDrivers(),taxiCrmFleetFreshness()]);return Response.json({drivers,fleet},{headers:{'Cache-Control':'no-store'}})}
  catch(error){return Response.json({error:'TaxiCRM live vehicle preview failed.',code:error&&typeof error==='object'&&'code' in error?String(error.code):undefined},{status:502})}
 }
 if(new URL(request.url).searchParams.get('preview')==='1'){
  const period=new URL(request.url).searchParams.get('period');
  try{return Response.json(await readTaxiCrmBookings(new URLSearchParams(`period=${period==='all'||period==='7days'?period:'today'}&pageSize=10`)),{headers:{'Cache-Control':'no-store'}})}
  catch(error){return Response.json({error:'TaxiCRM booking preview failed.',code:error&&typeof error==='object'&&'code' in error?String(error.code):undefined},{status:502})}
 }
 if(new URL(request.url).searchParams.get('schema')==='1'){
  try{return Response.json(await inspectTaxiCrmBookingSchema(),{headers:{'Cache-Control':'no-store'}})}
  catch(error){return Response.json({error:'TaxiCRM schema could not be inspected.',code:error&&typeof error==='object'&&'code' in error?String(error.code):undefined},{status:502})}
 }
 return Response.json({configured:taxiCrmDatabaseConfigured(),bookingReadEnabled:taxiCrmBookingReadEnabled()},{headers:{'Cache-Control':'no-store'}});
}

export async function POST(request:Request){
 if(!sameOrigin(request)||!await isAdmin())return Response.json({error:'Administrator access required.'},{status:403});
 try{const [snapshot,bookingMapping]=await Promise.all([verifyTaxiCrmDatabase(),inspectTaxiCrmBookingMapping()]);return Response.json({configured:true,bookingReadEnabled:taxiCrmBookingReadEnabled(),snapshot,bookingMapping},{headers:{'Cache-Control':'no-store'}})}
 catch(error){
  if(error instanceof TaxiCrmDatabaseConfigurationError)return Response.json({configured:false,error:error.message},{status:409});
  if(error instanceof TaxiCrmBookingSchemaError)return Response.json({configured:true,error:error.message},{status:422});
  console.error('TaxiCRM database verification failed',error instanceof Error?error.name:'Unknown failure');
  return Response.json({configured:true,error:'TaxiCRM database could not be reached or the read-only safety check failed.'},{status:502});
 }
}
