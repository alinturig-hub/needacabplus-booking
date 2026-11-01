import test from 'node:test';
import assert from 'node:assert/strict';
import {fleetList} from '../lib/fleet-admin';

const rows=[
 {externalId:'active',active:true,suspended:false,archived:false,companyId:1,fullName:'Current Driver'},
 {externalId:'suspended',active:true,suspended:true,archived:false,companyId:1,fullName:'Suspended Driver'},
 {externalId:'suspended-inactive',active:false,suspended:true,archived:false,companyId:2,fullName:'Suspended Without Active Flag'},
 {externalId:'archived',active:true,suspended:false,archived:true,companyId:99,fullName:'Archived Driver'},
 {externalId:'inactive',active:false,suspended:false,archived:false,companyId:99,fullName:'Inactive Driver'},
].map(row=>({...row,provider:'AUTOCAB',forename:row.fullName,surname:null,callsign:row.externalId,mobile:null,email:null,rawPayload:{},capabilities:[],lastApiSyncAt:new Date('2026-11-01T10:00:00Z')}));
function matches(row:Record<string,unknown>,where:Record<string,unknown>):boolean{
 return Object.entries(where).every(([key,value])=>{
  if(key==='AND')return (value as Record<string,unknown>[]).every(filter=>matches(row,filter));
  if(key==='OR')return (value as Record<string,unknown>[]).some(filter=>matches(row,filter));
  if(value&&typeof value==='object'){
   const condition=value as {contains?:string;not?:unknown};
   if(condition.contains!==undefined)return String(row[key]??'').toLowerCase().includes(condition.contains.toLowerCase());
   if('not'in condition)return row[key]!==condition.not;
  }
  return row[key]===value;
 });
}
const db={driver:{
 count:async({where}:{where:Record<string,unknown>})=>rows.filter(row=>matches(row,where)).length,
 findFirst:async({where}:{where:Record<string,unknown>})=>rows.find(row=>matches(row,where))??null,
 findMany:async({where,distinct,skip=0,take=100}:{where:Record<string,unknown>;distinct?:string[];skip?:number;take?:number})=>{
  const found=rows.filter(row=>matches(row,where));
  return distinct?[...new Set(found.map(row=>row.companyId))].map(companyId=>({companyId})):found.slice(skip,skip+take);
 },
}} as unknown as NonNullable<Parameters<typeof fleetList>[2]>;
const list=(params='')=>fleetList('drivers',new Request('https://example.test/api/admin/drivers?'+params),db);

test('driver list and totals include only active or suspended, never archived/inactive history',async()=>{
 const result=await list();
 assert.deepEqual(result.items.map(row=>row.external_id),['active','suspended','suspended-inactive']);
 assert.equal(result.total,3);assert.equal(result.summary.total,3);
 assert.equal(result.summary.active,1);assert.equal(result.summary.suspended,2);
 assert.deepEqual(result.companies,['1','2']);
});
test('status and search filters cannot bring archived or inactive drivers back',async()=>{
 assert.deepEqual((await list('status=Active')).items.map(row=>row.external_id),['active']);
 assert.equal((await list('status=Suspended')).total,2);
 assert.equal((await list('status=Archived')).items.some(row=>row.external_id==='archived'),false);
 assert.equal((await list('search=Inactive%20Driver')).total,0);
 assert.equal((await list('company=99')).total,0);
});
