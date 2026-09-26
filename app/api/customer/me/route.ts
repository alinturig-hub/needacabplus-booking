import {getCustomer} from '@/lib/customer-auth';
export async function GET(){const customer=await getCustomer();return customer?Response.json({customer},{headers:{'Cache-Control':'no-store'}}):Response.json({error:'Authentication required.'},{status:401})}
