import {isAdmin,sameOrigin} from '@/lib/security';
import {taxiCrmBookingReadEnabled,taxiCrmDatabaseConfigured,TaxiCrmDatabaseConfigurationError,verifyTaxiCrmDatabase} from '@/lib/taxicrm-database';
import {inspectTaxiCrmBookingMapping,inspectTaxiCrmBookingSchema,readTaxiCrmBookings,TaxiCrmBookingSchemaError} from '@/lib/taxicrm-bookings';

export const dynamic='force-dynamic';

export async function GET(request:Request){
 if(!await isAdmin())return Response.json({error:'Administrator access required.'},{status:403});
 if(new URL(request.url).searchParams.get('preview')==='1'){
  try{return Response.json(await readTaxiCrmBookings(new URLSearchParams('period=today&pageSize=10')),{headers:{'Cache-Control':'no-store'}})}
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
