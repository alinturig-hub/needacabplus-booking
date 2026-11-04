import type {Pool} from 'pg';
import {DEFAULT_EBOOKER_SLUG} from './ebooker-links';

/** Retain the source row and its booking references; retired slugs cannot be reused. */
export async function deleteEbooker(db:Pick<Pool,'query'>,id:string,revision:number){
 const changed=await db.query(`UPDATE ebookers SET enabled=false,revision=revision+1,updated_at=now(),settings=settings||jsonb_build_object('_deletedAt',now()) WHERE id=$1 AND revision=$2 AND slug<>$3 AND NOT(settings ? '_deletedAt') RETURNING id`,[id,revision,DEFAULT_EBOOKER_SLUG]);
 if(changed.rows.length)return 'deleted' as const;
 const row=(await db.query<{slug:string;deleted:boolean}>(`SELECT slug,settings ? '_deletedAt' AS deleted FROM ebookers WHERE id=$1`,[id])).rows[0];
 if(!row)return 'missing' as const;
 if(row.slug===DEFAULT_EBOOKER_SLUG)return 'default' as const;
 return row.deleted?'deleted' as const:'conflict' as const;
}
