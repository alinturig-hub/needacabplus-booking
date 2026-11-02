import {randomUUID} from 'node:crypto';
export type Transaction = {query:(sql:string,values:unknown[])=>Promise<{rows:Record<string,unknown>[]}>};
export type CampaignDraft = {name:string;objective:string;audienceRules:Record<string,unknown>;rewardRules:Record<string,unknown>;budgetPence:number};
/** Existing marketing_campaigns table. Caller must provide an authenticated tenant-scoped transaction. */
export async function createCampaignDraft(tx:Transaction,draft:CampaignDraft){
 if(!draft.name.trim()||draft.name.length>120||!Number.isSafeInteger(draft.budgetPence)||draft.budgetPence<0)throw Error('INVALID_CAMPAIGN');
 const id=randomUUID();
 await tx.query(`INSERT INTO marketing_campaigns(id,name,status,created_by,objective,audience_rules,reward_rules,budget_rules) VALUES($1,$2,'draft','admin',$3,$4::jsonb,$5::jsonb,$6::jsonb)`,[id,draft.name,draft.objective,JSON.stringify(draft.audienceRules),JSON.stringify(draft.rewardRules),JSON.stringify({currency:'GBP',maximumSpendPence:draft.budgetPence})]);
 return {id,status:'draft'};
}
/** Row lock serializes concurrent approval. Snapshot comparison prevents approving stale edits. */
export async function approveCampaign(tx:Transaction,id:string,expectedSnapshot:string){
 const result=await tx.query(`SELECT id,name,status,objective,audience_rules,reward_rules,budget_rules,updated_at FROM marketing_campaigns WHERE id=$1 FOR UPDATE`,[id]);
 const row=result.rows[0];if(!row)throw Error('CAMPAIGN_NOT_FOUND');
 if(row.status!=='draft')throw Error('CAMPAIGN_NOT_DRAFT');
 if(campaignSnapshot(row)!==expectedSnapshot)throw Error('CAMPAIGN_CHANGED');
 await tx.query(`UPDATE marketing_campaigns SET status='approved',approved_at=now(),updated_at=now() WHERE id=$1 AND status='draft'`,[id]);
 return {id,status:'approved'};
}
export function campaignSnapshot(row:Record<string,unknown>){
 return JSON.stringify([row.id,row.name,row.objective,row.audience_rules,row.reward_rules,row.budget_rules,row.updated_at instanceof Date?row.updated_at.toISOString():row.updated_at]);
}
