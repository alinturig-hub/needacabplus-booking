import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {database} from '@/lib/database';
import {currentDriver} from '@/lib/driver-app';
import {sameOrigin,unavailable} from '@/lib/security';
export const dynamic='force-dynamic';
export async function POST(request:Request){
 if(!sameOrigin(request))return Response.json({error:'Invalid request origin.'},{status:403});let client;
 try{const driver=await currentDriver();if(!driver)return Response.json({error:'Driver sign-in required.'},{status:401});const body=z.object({jobId:z.string().uuid(),action:z.enum(['accept','decline','arrive','pob','complete'])}).strict().parse(await request.json());client=await database().connect();await client.query('BEGIN');await client.query('SELECT id FROM driver_app_accounts WHERE id=$1 FOR UPDATE',[driver.id]);const job=(await client.query('SELECT * FROM driver_app_jobs WHERE id=$1 AND account_id=$2 FOR UPDATE',[body.jobId,driver.id])).rows[0];
 const expected={accept:'offered',decline:'offered',arrive:'accepted',pob:'arrived',complete:'pob'}[body.action];
 if(!job||job.status!==expected||(expected==='offered'&&new Date(job.expires_at).getTime()<=Date.now())){await client.query('ROLLBACK');return Response.json({error:'This action is no longer available. Refresh your jobs.'},{status:409})}
 if(body.action==='accept'&&(await client.query("SELECT 1 FROM driver_app_jobs WHERE account_id=$1 AND status IN('accepted','arrived','pob')",[driver.id])).rows.length){await client.query('ROLLBACK');return Response.json({error:'Finish your current job first.'},{status:409})}
 const next={accept:'accepted',decline:'declined',arrive:'arrived',pob:'pob',complete:'completed'}[body.action],field={accept:'accepted_at',arrive:'arrived_at',pob:'pob_at',complete:'completed_at',decline:null}[body.action];
 await client.query(`UPDATE driver_app_jobs SET status=$2${field?`,${field}=now()`:''} WHERE id=$1`,[job.id,next]);await client.query('INSERT INTO driver_app_events(id,job_id,account_id,action) VALUES($1,$2,$3,$4)',[randomUUID(),job.id,driver.id,body.action]);await client.query('COMMIT');return Response.json({ok:true});
 }catch(e){if(client)await client.query('ROLLBACK').catch(()=>{});if(e instanceof z.ZodError||e instanceof SyntaxError)return Response.json({error:'Invalid job action.'},{status:400});return unavailable(e)}finally{client?.release()}
}
