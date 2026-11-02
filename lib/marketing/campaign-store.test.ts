import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createCampaignDraft,approveCampaign,campaignSnapshot,type Transaction} from './campaign-store';
test('draft uses existing table and stores GBP budget in pence',async()=>{
 const calls:{sql:string;values:unknown[]}[]=[];const tx:Transaction={query:async(sql,values)=>{calls.push({sql,values});return {rows:[]}}};
 const r=await createCampaignDraft(tx,{name:'Synthetic',objective:'Test',audienceRules:{},rewardRules:{},budgetPence:1000});assert.equal(r.status,'draft');assert.match(calls[0].sql,/INSERT INTO marketing_campaigns/);assert.equal(JSON.parse(calls[0].values[5] as string).maximumSpendPence,1000);
});
test('changed campaign cannot be approved and locks before comparison',async()=>{
 let writes=0;const tx:Transaction={query:async(sql)=>{if(sql.startsWith('SELECT')){assert.match(sql,/FOR UPDATE/);return {rows:[{id:'synthetic',status:'draft'}]}}writes++;return {rows:[]}}};
 await assert.rejects(approveCampaign(tx,'synthetic','stale'),/CAMPAIGN_CHANGED/);assert.equal(writes,0);
});
test('approval never activates benefits or sends messages',async()=>{
 const row={id:'synthetic',name:'Test',status:'draft',updated_at:'2026-11-02T00:00:00Z'};const calls:string[]=[];const tx:Transaction={query:async(sql)=>{calls.push(sql);return {rows:sql.startsWith('SELECT')?[row]:[]}}};
 assert.equal((await approveCampaign(tx,'synthetic',campaignSnapshot(row))).status,'approved');assert.equal(calls.length,2);assert.match(calls[1],/status='approved'/);
});
