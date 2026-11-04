import {DatabaseSync} from 'node:sqlite';
import {mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {selectionSchema,type Selection} from './fixtures';
/** This isolated file contains only synthetic fixtures, nonce IDs and counters. */
export class StageStore{
 private db:DatabaseSync;
 constructor(directory:string,role:string){
  mkdirSync(directory,{recursive:true,mode:0o700});this.db=new DatabaseSync(join(directory,role+'.sqlite'));
  this.db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS nonce(id TEXT PRIMARY KEY, expires INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS state(key TEXT PRIMARY KEY,value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS counter(key TEXT PRIMARY KEY,value INTEGER NOT NULL);');
  this.db.prepare('INSERT OR IGNORE INTO state(key,value) VALUES(?,?)').run('instance',randomUUID());
 }
 reserve=(id:string)=>{const now=Date.now();this.db.prepare('DELETE FROM nonce WHERE expires<?').run(now);const r=this.db.prepare('INSERT OR IGNORE INTO nonce(id,expires) VALUES(?,?)').run(id,now+600000);return Promise.resolve(r.changes===1)};
 get(key:string){return this.db.prepare('SELECT value FROM state WHERE key=?').get(key)?.value as string|undefined}
 set(key:string,value:string){this.db.prepare('INSERT INTO state(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key,value)}
 select(selection:Selection){this.db.exec('BEGIN IMMEDIATE');try{const revision=Number(this.get('revision')||'0')+1;this.set('selection',JSON.stringify(selectionSchema.parse(selection)));this.set('operator','false');this.set('revision',String(revision));this.db.exec('COMMIT')}catch(e){this.db.exec('ROLLBACK');throw e}}
 selection(){const raw=this.get('selection');if(!raw)throw Error('STAGING_FIXTURE_NOT_SELECTED');return selectionSchema.parse(JSON.parse(raw))}
 operator(){return this.get('operator')==='true'}
 takeover(){this.db.exec('BEGIN IMMEDIATE');try{this.set('operator','true');this.set('revision',String(Number(this.get('revision')||'0')+1));this.db.exec('COMMIT')}catch(e){this.db.exec('ROLLBACK');throw e}}
 count(key:string){this.db.prepare('INSERT INTO counter(key,value) VALUES(?,1) ON CONFLICT(key) DO UPDATE SET value=value+1').run(key)}
 stats(){return {instance:this.get('instance'),revision:Number(this.get('revision')||'0'),nonces:Number(this.db.prepare('SELECT count(*) AS n FROM nonce').get()?.n),counters:Object.fromEntries(this.db.prepare('SELECT key,value FROM counter').all().map(r=>[String(r.key),Number(r.value)]))}}
 close(){this.db.close()}
}
