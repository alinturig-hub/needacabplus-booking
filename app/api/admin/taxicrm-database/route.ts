import {isAdmin,sameOrigin} from '@/lib/security';
import {taxiCrmDatabaseConfigured,TaxiCrmDatabaseConfigurationError,verifyTaxiCrmDatabase} from '@/lib/taxicrm-database';

export const dynamic='force-dynamic';

export async function GET(){
 if(!await isAdmin())return Response.json({error:'Administrator access required.'},{status:403});
 return Response.json({configured:taxiCrmDatabaseConfigured()},{headers:{'Cache-Control':'no-store'}});
}

export async function POST(request:Request){
 if(!sameOrigin(request)||!await isAdmin())return Response.json({error:'Administrator access required.'},{status:403});
 try{return Response.json({configured:true,snapshot:await verifyTaxiCrmDatabase()},{headers:{'Cache-Control':'no-store'}})}
 catch(error){
  if(error instanceof TaxiCrmDatabaseConfigurationError)return Response.json({configured:false,error:error.message},{status:409});
  console.error('TaxiCRM database verification failed',error instanceof Error?error.name:'Unknown failure');
  return Response.json({configured:true,error:'TaxiCRM database could not be reached or the read-only safety check failed.'},{status:502});
 }
}
