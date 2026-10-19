import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {REGISTRY_SCHEMA,registryUrl,parseRegistryPage,saveRegistryResponse} from '../scripts/autocab-history-registry.mjs';
test('registry paging never sends the subscription key to another host or operation',()=>{
 assert.equal(registryUrl('drivers','/driver/v1/drivers?page=2'),'https://autocab-api.azure-api.net/driver/v1/drivers?page=2');
 for(const url of ['https://evil.invalid/driver/v1/drivers','https://autocab-api.azure-api.net/booking/v1/booking','https://user@autocab-api.azure-api.net/driver/v1/drivers'])assert.throws(()=>registryUrl('drivers',url));
});
test('only actual provider IDs identify entities; unknown paging cannot be silently truncated',()=>{
 assert.throws(()=>parseRegistryPage('drivers',[{callsign:'123'}]),/ID_INVALID/);
 assert.throws(()=>parseRegistryPage('vehicles',{vehicles:[{id:1}],continuationToken:'more'}),/PAGINATION_REQUIRES_CONTRACT/);
 assert.throws(()=>parseRegistryPage('drivers',{items:[{id:1}],totalCount:100}),/PAGINATION_REQUIRES_CONTRACT/);
 assert.equal(parseRegistryPage('drivers',{items:[{id:2}],totalCount:2},1).nextUrl,null);
 assert.throws(()=>parseRegistryPage('drivers',[{id:1,sourceSystem:'TaxiCRM'}]),/SOURCE_INVALID/);
});
async function database(){const db=new PGlite();await db.exec(REGISTRY_SCHEMA);await db.query("INSERT INTO autocab_registry_progress(resource) VALUES('drivers'),('vehicles')");return db}
test('store full JSON and versions; upsert IDs without deleting missing profiles',async()=>{
 const db=await database();try{
 const url=registryUrl('drivers');
 const one={id:1,callsign:'A',suspended:false,unknown:{nested:['keep']}};
 await saveRegistryResponse(db,'drivers',url,[one,{id:2,callsign:'B'}]);
 await saveRegistryResponse(db,'drivers',url,[{...one,suspended:true}]);
 const rows=(await db.query('SELECT * FROM autocab_drivers ORDER BY autocab_id')).rows;
 assert.equal(rows.length,2);assert.deepEqual(rows[0].raw_payload,{...one,suspended:true});
 assert.equal((await db.query('SELECT count(*) AS n FROM autocab_registry_versions')).rows[0].n,3);
 assert.equal((await db.query('SELECT status FROM autocab_registry_progress WHERE resource=$1',['drivers'])).rows[0].status,'COMPLETE');
 await saveRegistryResponse(db,'vehicles',registryUrl('vehicles'),{vehicles:[{id:7,registration:'TEST',future:0}]});
 assert.equal((await db.query('SELECT raw_payload FROM autocab_vehicles')).rows[0].raw_payload.future,0);
 }finally{await db.close()}
});
test('malformed page is archived and blocked; no entity or progress is skipped',async()=>{
 const db=await database();try{
 const body={drivers:[{callsign:'not-an-id'}]};
 await assert.rejects(()=>saveRegistryResponse(db,'drivers',registryUrl('drivers'),body),/ID_INVALID/);
 assert.deepEqual((await db.query('SELECT raw_response FROM autocab_registry_responses')).rows[0].raw_response,body);
 const p=(await db.query('SELECT * FROM autocab_registry_progress WHERE resource=$1',['drivers'])).rows[0];
 assert.equal(p.status,'BLOCKED');assert.equal(p.pages,0);
 assert.equal((await db.query('SELECT count(*) AS n FROM autocab_drivers')).rows[0].n,0);
 }finally{await db.close()}
});
test('entity, version, complete response and checkpoint roll back together on database failure',async()=>{
 const db=await database();try{
 const wrapped={query:async(sql,args)=>{if(sql.startsWith('INSERT INTO autocab_registry_responses'))throw new Error('simulated failure');return db.query(sql,args)}};
 await assert.rejects(()=>saveRegistryResponse(wrapped,'drivers',registryUrl('drivers'),[{id:1}]),/simulated failure/);
 assert.equal((await db.query('SELECT count(*) AS n FROM autocab_drivers')).rows[0].n,0);
 assert.equal((await db.query('SELECT count(*) AS n FROM autocab_registry_versions')).rows[0].n,0);
 assert.equal((await db.query('SELECT pages FROM autocab_registry_progress WHERE resource=$1',['drivers'])).rows[0].pages,0);
 }finally{await db.close()}
});
