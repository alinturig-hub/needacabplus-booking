import {autocabIntegrationEnabled} from '@/lib/integration-control';
export const dynamic='force-dynamic';
export async function GET(){try{return Response.json({autocabEnabled:await autocabIntegrationEnabled()},{headers:{'Cache-Control':'no-store'}})}catch{return Response.json({autocabEnabled:false},{status:503,headers:{'Cache-Control':'no-store'}})}}
