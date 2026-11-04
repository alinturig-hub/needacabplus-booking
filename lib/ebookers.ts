import {bookingAttemptDatabase,database} from './database';
import {ebookerInputSchema,type EbookerConfig,type EbookerClaim} from './ebooker-policy';
export type EbookerRow={id:string;slug:string;settings:unknown;revision:number;enabled:boolean};
export function ebookerFromRow(row:EbookerRow):EbookerConfig{return {...ebookerInputSchema.parse(row.settings),id:row.id,slug:row.slug,enabled:row.enabled,revision:row.revision}}
export async function loadEbooker(slug:string,includeDisabled=false){
 if(!/^[a-z0-9-]{3,80}$/.test(slug))return null;
 const result=await database().query<EbookerRow>(`SELECT id,slug,settings,enabled,revision FROM ebookers WHERE slug=$1 AND ($2::boolean OR enabled) AND NOT(settings ? '_deletedAt')`,[slug,includeDisabled]);
 return result.rows[0]?ebookerFromRow(result.rows[0]):null;
}
export async function claimEbookerRequest(claim:EbookerClaim,quoteId:string,userId:string,db:Pick<ReturnType<typeof database>,'query'>=database()){
 await db.query('INSERT INTO ebooker_booking_origins(quote_id,ebooker_id,user_id) VALUES($1,$2,$3) ON CONFLICT(quote_id) DO NOTHING',[quoteId,claim.id,userId]);
 const result=await db.query<{ebooker_id:string;user_id:string}>('SELECT ebooker_id,user_id FROM ebooker_booking_origins WHERE quote_id=$1',[quoteId]);
 if(result.rows[0]?.ebooker_id!==claim.id||result.rows[0]?.user_id!==userId)throw new Error('This booking request has already been used.');
}

export async function findOwnedEbookerRequest(ebookerId:string,userId:string,reference:string,db:Pick<ReturnType<typeof database>,'query'>=database(),attempts:Pick<ReturnType<typeof database>,'query'>=bookingAttemptDatabase()){
 const value=reference.trim().replace(/^NAC-/i,'');
 const owned=await db.query<{quote_id:string}>('SELECT quote_id FROM ebooker_booking_origins WHERE ebooker_id=$1 AND user_id=$2 AND quote_id::text=$3',[ebookerId,userId,value]);
 if(owned.rows[0])return owned.rows[0].quote_id;
 if(!/^\d{1,20}$/.test(value))return null;
 const candidates=await attempts.query<{quote_id:string}>('SELECT quote_id FROM web_booking_attempts WHERE user_id=$1 AND external_booking_id=$2',[userId,value]);
 if(!candidates.rows.length)return null;
 const match=await db.query<{quote_id:string}>('SELECT quote_id FROM ebooker_booking_origins WHERE ebooker_id=$1 AND user_id=$2 AND quote_id=ANY($3::uuid[]) LIMIT 1',[ebookerId,userId,candidates.rows.map(row=>row.quote_id)]);
 return match.rows[0]?.quote_id||null;
}
