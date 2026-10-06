import {randomUUID} from 'node:crypto';
import {database} from './database';
import {hashPassword,setCustomerSession} from './customer-auth';

type Provider='google'|'apple';

export async function completeOAuthAccount(provider:Provider,subject:string,email:string,fullName:string){
 const db=database();
 const identity=(await db.query<{id:string}>('SELECT c.id FROM customer_identities i JOIN customer_accounts c ON c.id=i.customer_id WHERE i.provider=$1 AND i.subject=$2',[provider,subject])).rows[0];
 if(identity){await setCustomerSession(identity.id);return {ok:true}}

 const existing=(await db.query<{id:string}>('SELECT id FROM customer_accounts WHERE lower(email)=lower($1)',[email])).rows[0];
 if(existing){
  await db.query('INSERT INTO customer_identities(provider,subject,customer_id) VALUES($1,$2,$3)',[provider,subject,existing.id]);
  await setCustomerSession(existing.id);return {ok:true};
 }

 const id=randomUUID(),connection=await db.connect();
 try{
  await connection.query('BEGIN');
  await connection.query('INSERT INTO customer_accounts(id,email,password_hash,full_name,phone) VALUES($1,$2,$3,$4,$5)',[id,email,await hashPassword(randomUUID()+randomUUID()),fullName,'']);
  await connection.query('INSERT INTO customer_identities(provider,subject,customer_id) VALUES($1,$2,$3)',[provider,subject,id]);
  await connection.query('COMMIT');
 }catch(error){await connection.query('ROLLBACK');throw error}finally{connection.release()}
 await setCustomerSession(id);return {ok:true};
}
