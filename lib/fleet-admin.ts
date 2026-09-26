import {database} from '@/lib/database';

export type FleetResource='drivers'|'vehicles';

export async function fleetList(resource:FleetResource,request:Request){
 const url=new URL(request.url),pageSize=Math.min(100,Math.max(10,Number(url.searchParams.get('pageSize'))||20)),requestedPage=Math.max(1,Number(url.searchParams.get('page'))||1),search=(url.searchParams.get('search')||'').trim(),status=(url.searchParams.get('status')||'All').trim(),company=(url.searchParams.get('company')||'All').trim();
 const table=resource==='drivers'?'autocab_drivers':'autocab_vehicles';
 const searchColumns=resource==='drivers'?['external_id','callsign','display_name','mobile','email']:['external_id','callsign','registration','make','model','colour'];
 const fleetScope="(lower(trim(company)) LIKE 'taxi services (plymouth) ltd%' OR lower(trim(company)) LIKE 'plymouth taxi%' OR lower(trim(company)) LIKE 'taxicrm%')";
 const values:unknown[]=[],where:string[]=[fleetScope];
 if(search){values.push(`%${search}%`);where.push(`(${searchColumns.map(column=>`${column} ILIKE $${values.length}`).join(' OR ')})`)}
 if(status==='Active')where.push('suspended=false');else if(status==='Suspended')where.push('suspended=true');
 if(company!=='All'){values.push(company);where.push(`lower(trim(company))=lower(trim($${values.length}))`)}
 const clause=where.length?`WHERE ${where.join(' AND ')}`:'';
 const db=database(),countResult=await db.query<{total:string}>(`SELECT COUNT(*)::text AS total FROM ${table} ${clause}`,values),total=Number(countResult.rows[0]?.total||0),pages=Math.max(1,Math.ceil(total/pageSize)),page=Math.min(requestedPage,pages),offset=(page-1)*pageSize;
 const [items,summary,companies]=await Promise.all([
  db.query(`SELECT * FROM ${table} ${clause} ORDER BY suspended ASC,${resource==='drivers'?'display_name':'COALESCE(callsign,registration,external_id)'} ASC LIMIT $${values.length+1} OFFSET $${values.length+2}`,[...values,pageSize,offset]),
  db.query<{total:string;active:string;suspended:string;last_synced:string|null}>(`SELECT COUNT(*)::text AS total,COUNT(*) FILTER (WHERE suspended=false)::text AS active,COUNT(*) FILTER (WHERE suspended=true)::text AS suspended,MAX(synced_at)::text AS last_synced FROM ${table} WHERE ${fleetScope}`),
  db.query<{company:string}>(`SELECT DISTINCT company FROM ${table} WHERE company IS NOT NULL AND ${fleetScope} ORDER BY company`)
 ]);
 const totals=summary.rows[0]||{total:'0',active:'0',suspended:'0',last_synced:null};
 return {items:items.rows,total,page,pageSize,companies:companies.rows.map(item=>item.company),summary:{total:Number(totals.total),active:Number(totals.active),suspended:Number(totals.suspended),lastSynced:totals.last_synced}};
}
