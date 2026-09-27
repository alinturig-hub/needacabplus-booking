import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {getCustomer} from '@/lib/customer-auth';
import {database} from '@/lib/database';
import {sameOrigin,unavailable} from '@/lib/security';

const schema=z.object({address:z.string().trim().min(3).max(250),fullAddress:z.record(z.unknown()),placeID:z.string().nullable().optional()});
function item(row:Record<string,unknown>){return{id:String(row.id),address:String(row.address),fullAddress:row.full_address as Record<string,unknown>,placeID:row.place_id?String(row.place_id):null,customAddressID:null}}
export async function GET(){const customer=await getCustomer();if(!customer)return Response.json({history:[]},{headers:{'Cache-Control':'no-store'}});try{const result=await database().query('SELECT id,address,full_address,place_id FROM customer_address_history WHERE customer_id=$1 ORDER BY used_at DESC LIMIT 10',[customer.id]);return Response.json({history:result.rows.map(item)},{headers:{'Cache-Control':'no-store'}})}catch(error){return unavailable(error)}}
export async function POST(request:Request){if(!sameOrigin(request))return Response.json({error:'Invalid request origin.'},{status:403});const customer=await getCustomer();if(!customer)return Response.json({ok:true});try{const input=schema.parse(await request.json());await database().query('INSERT INTO customer_address_history (id,customer_id,address,full_address,place_id) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (customer_id,address) DO UPDATE SET full_address=EXCLUDED.full_address,place_id=EXCLUDED.place_id,used_at=now()',[randomUUID(),customer.id,input.address,input.fullAddress,input.placeID||null]);return Response.json({ok:true})}catch(error){if(error instanceof z.ZodError)return Response.json({error:'Invalid address.'},{status:400});return unavailable(error)}}
