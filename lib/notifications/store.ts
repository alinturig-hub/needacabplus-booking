import type {Pool} from 'pg';
function stable(value:unknown):string{if(value===null||typeof value!=='object')return JSON.stringify(value);if(Array.isArray(value))return '['+value.map(stable).join(',')+']';const object=value as Record<string,unknown>;return '{'+Object.keys(object).sort().map(k=>JSON.stringify(k)+':'+stable(object[k])).join(',')+'}'}
import {ruleSchema,type Rule,type Decision} from './model';
export async function rules(db:Pool){return (await db.query('SELECT definition FROM notification_rules ORDER BY id')).rows.map(row=>ruleSchema.parse(row.definition))}
export async function saveRule(db:Pool,rule:Rule,action:'save'|'activate'|'disable',expectedVersion:number){
 const parsed=ruleSchema.parse(rule),client=await db.connect();
 try{await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`notification-rule:${parsed.id}`]);
 const previous=(await client.query('SELECT definition FROM notification_rules WHERE id=$1 FOR UPDATE',[parsed.id])).rows[0];
 const old=previous?ruleSchema.parse(previous.definition):null;if((old?.version||0)!==expectedVersion)throw Error('RULE_VERSION_CONFLICT');
 if(action!=='save'&&!old)throw Error('RULE_NOT_FOUND');
 // Activation always applies to the stored revision, never a different browser draft.
 const next:Rule={...(action==='save'?parsed:old!),version:expectedVersion+1,status:action==='activate'?'active':action==='disable'?'disabled':'draft'};
 await client.query(`INSERT INTO notification_rules(id,version,status,definition) VALUES($1,$2,$3,$4::jsonb) ON CONFLICT(id) DO UPDATE SET version=EXCLUDED.version,status=EXCLUDED.status,definition=EXCLUDED.definition,updated_at=now()`,[next.id,next.version,next.status,JSON.stringify(next)]);
 await client.query('INSERT INTO notification_rule_revisions(rule_id,version,action,definition) VALUES($1,$2,$3,$4::jsonb)',[next.id,next.version,action,JSON.stringify(next)]);await client.query('COMMIT');return next;
 }catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}
}
export async function recordDecision(db:Pool,requestId:string,d:Decision){
 if(!d.bookingId.startsWith('SYNTHETIC-')||d.mode!=='DRY_RUN')throw Error('SYNTHETIC_ONLY');
 const saved=await db.query(`INSERT INTO notification_decisions(request_id,rule_id,rule_version,booking_id,event,channel,result,reason,decision) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb) ON CONFLICT(request_id) DO NOTHING RETURNING id::text`,[requestId,d.ruleId,d.ruleVersion,d.bookingId,d.event,d.channel,d.result,d.reason,JSON.stringify(d)]);
 if(saved.rows.length)return {id:saved.rows[0].id,decision:d};
 const old=(await db.query('SELECT id::text,decision FROM notification_decisions WHERE request_id=$1',[requestId])).rows[0];if(stable(old.decision)!==stable(d))throw Error('REQUEST_CONFLICT');return old;
}
export async function history(db:Pool,filter:{booking?:string;event?:string;channel?:string;rule?:string;result?:string;before?:string}){
 const values:unknown[]=[],clauses:string[]=[];for(const [key,column] of [['booking','booking_id'],['event','event'],['channel','channel'],['rule','rule_id'],['result','result']] as const)if(filter[key]){values.push(filter[key]);clauses.push(`${column}=$${values.length}`)}
 if(filter.before){if(!/^\d{1,18}$/.test(filter.before))throw Error('INVALID_CURSOR');values.push(filter.before);clauses.push(`id<$${values.length}::bigint`)}
 const rows=(await db.query(`SELECT id::text,decision,created_at FROM notification_decisions ${clauses.length?'WHERE '+clauses.join(' AND '):''} ORDER BY id DESC LIMIT 51`,values)).rows;
 return {items:rows.slice(0,50),nextCursor:rows.length>50?rows[49].id:null};
}
