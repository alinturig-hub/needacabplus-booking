import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {ebookerInputSchema,ebookerJourney,validateEbookerClaim,type EbookerConfig,type EbookerClaim} from '../lib/ebooker-policy';
import {claimEbookerRequest,findOwnedEbookerRequest} from '../lib/ebookers';
import {signQuote,verifyQuote} from '../lib/quote-token';
import {buildLiveCashBookingRequest} from '../lib/autocab-booking-request';
import {buildAutocabQuoteRequest} from '../lib/autocab-quote-request';
import type {FareQuote} from '../lib/quotes';
const stop=(name:string)=>({text:name,coordinate:{latitude:50.37,longitude:-4.14},zoneId:1});
const id='11111111-1111-4111-8111-111111111111',quoteId='22222222-2222-4222-8222-222222222222';
const config:EbookerConfig={id,revision:1,name:'Station eBooker',slug:'station-ebooker',enabled:true,logoUrl:'',supportPhone:'+441234567890',pickupMode:'fixed',pickup:stop('Plymouth Station'),maxPassengers:4};
const claim:EbookerClaim={id,slug:config.slug,name:config.name,revision:1,passengers:2};

test('fixed pickup is enforced server-side while preset pickup remains editable',()=>{
 assert.deepEqual(ebookerJourney(config,{pickup:stop('Another location'),passengers:2,revision:1}).pickup,config.pickup);
 assert.equal(ebookerJourney({...config,pickupMode:'preset'},{pickup:stop('Another location'),passengers:2,revision:1}).pickup.text,'Another location');
 assert.throws(()=>ebookerJourney({...config,enabled:false},{pickup:stop('Another location'),passengers:2,revision:1}));
 assert.throws(()=>ebookerJourney(config,{pickup:stop('Another location'),passengers:5,revision:1}));
 assert.throws(()=>ebookerJourney({...config,revision:2},{pickup:stop('Another location'),passengers:2,revision:1}));
 const {id:ignored,revision,...settings}=config;void ignored;void revision;
 assert.equal(ebookerInputSchema.safeParse({...settings,pickup:null}).success,false);
 assert.equal(ebookerInputSchema.safeParse({...settings,pickupMode:'none',pickup:null}).success,true);
 assert.equal(ebookerInputSchema.safeParse({...settings,logoUrl:'javascript:alert(1)'}).success,false);
 assert.equal(ebookerInputSchema.safeParse({...settings,slug:'../admin'}).success,false);
});
test('old quotes cannot bypass configuration changes, disabling, passenger limits or fixed pickup',()=>{
 assert.doesNotThrow(()=>validateEbookerClaim(config,claim,config.pickup!.text,2));
 for(const current of [null,{...config,enabled:false},{...config,revision:2},{...config,id:quoteId}])assert.throws(()=>validateEbookerClaim(current,claim,config.pickup!.text,2));
 assert.throws(()=>validateEbookerClaim(config,claim,'Different pickup',2));
 assert.throws(()=>validateEbookerClaim(config,claim,config.pickup!.text,3));
});
test('guest eBooker bookings preserve the canonical quote reference and contain no fabricated email',()=>{
 process.env.ADMIN_SESSION_SECRET='synthetic-ebooker-signing-secret-32-characters';
 const now=new Date(),quote:FareQuote={id:quoteId,ebooker:claim,service:'asap',vehicle:'saloon',scheduledAt:null,pickup:'Plymouth Station',destination:'Derriford Hospital',vias:[],basePence:1000,upliftPence:0,totalPence:1000,percent:0,demand:'normal',expiresAt:new Date(now.getTime()+60000).toISOString(),currency:'GBP',liveBooking:true,paymentMethod:'cash',autocabCosts:{cost:7,bookingCost:7},autocabRequest:buildAutocabQuoteRequest({pickup:stop('Plymouth Station'),destination:stop('Derriford Hospital'),vias:[],vehicle:'saloon',scheduledAt:null},[],now)};
 const token=signQuote(quote);assert.deepEqual(verifyQuote(token).ebooker,claim);assert.throws(()=>verifyQuote(token.slice(0,-3)+'xxx'));
 const body=buildLiveCashBookingRequest(quote,{name:'Synthetic Guest',telephoneNumber:'+447700900123',customerEmail:'',passengers:2,luggage:0,driverNote:''},now);
 assert.equal(body.ourReference,'NAC-'+quoteId);assert.equal(body.bookingSource,'ThirdPartyWebsite');assert.equal(body.hold,false);
 assert.ok(body.officeNote.includes(id));assert.equal('customerEmail'in JSON.parse(JSON.stringify(body)),false);
});
test('migration and ownership claims prevent duplicate submissions and cross-user or cross-eBooker tracking',async()=>{
 const db=new PGlite();
 try{
  await db.exec(await readFile(new URL('../scripts/migrations/20261102_ebookers.sql',import.meta.url),'utf8'));
  await db.query('INSERT INTO ebookers(id,slug,settings,enabled) VALUES($1,$2,$3,true)',[id,config.slug,config]);
  await db.query('INSERT INTO ebookers(id,slug,settings,enabled) VALUES($1,$2,$3,false)',[quoteId,'another-hotel',{...config,name:'Another Hotel'}]);
  assert.equal((await db.query<{count:number}>('SELECT count(*)::int AS count FROM ebookers')).rows[0].count,2);
  const client=db as unknown as NonNullable<Parameters<typeof claimEbookerRequest>[3]>;
  await Promise.all([claimEbookerRequest(claim,quoteId,'guest:one',client),claimEbookerRequest(claim,quoteId,'guest:one',client)]);
  assert.equal((await db.query<{count:number}>('SELECT count(*)::int AS count FROM ebooker_booking_origins')).rows[0].count,1);
  await assert.rejects(claimEbookerRequest(claim,quoteId,'guest:other',client));
  await db.exec('CREATE TABLE web_booking_attempts(quote_id uuid,user_id text,external_booking_id text)');
  await db.query('INSERT INTO web_booking_attempts VALUES($1,$2,$3)',[quoteId,'guest:one','12345678']);
  assert.equal(await findOwnedEbookerRequest(id,'guest:one',quoteId,client,client),quoteId);
  assert.equal(await findOwnedEbookerRequest(id,'guest:one','NAC-'+quoteId,client,client),quoteId);
  assert.equal(await findOwnedEbookerRequest(id,'guest:one','12345678',client,client),quoteId);
  assert.equal(await findOwnedEbookerRequest(id,'guest:other','12345678',client,client),null);
  assert.equal(await findOwnedEbookerRequest(quoteId,'guest:one','12345678',client,client),null);
  const first=await db.query('UPDATE ebookers SET revision=revision+1 WHERE id=$1 AND revision=1 RETURNING id',[id]);
  const stale=await db.query('UPDATE ebookers SET revision=revision+1 WHERE id=$1 AND revision=1 RETURNING id',[id]);
  assert.equal(first.rows.length,1);assert.equal(stale.rows.length,0);
  await assert.rejects(db.query('DELETE FROM ebookers WHERE id=$1',[id]));
 }finally{await db.close()}
});
