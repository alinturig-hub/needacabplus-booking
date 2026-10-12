const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');

function load(){
 const mod={exports:{}};
 const code=ts.transpileModule(fs.readFileSync('lib/taxicrm-bookings.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 new Function('require','module','exports',code)(id=>{
  if(id==='@/lib/booking-period')return {bookingPeriod:()=>({period:'today',start:'2026-10-11',end:'2026-10-11'})};
  if(id==='@/lib/taxicrm-database')return {withTaxiCrmReadOnly:async()=>{throw Error('not used')}};
  return require(id);
 },mod,mod.exports);
 return mod.exports;
}

const {chooseTaxiCrmBookingMapping,TaxiCrmBookingSchemaError}=load();
const column=(table,name,dataType='text')=>({schema:'public',table,name,dataType,udtName:dataType,ordinal:1});

test('TaxiCRM schema mapper prefers the complete bookings table',()=>{
 const columns=[
  column('webhook_events','id'),column('webhook_events','status'),
  ...['id','booking_reference','booking_status','passenger_name','telephone_number','pickup_address','destination_address','pickup_time','payment_method','passenger_price'].map(name=>column('bookings',name)),
  column('jobs_archive','id'),column('jobs_archive','status'),column('jobs_archive','pickup'),column('jobs_archive','destination'),
 ];
 const mapping=chooseTaxiCrmBookingMapping(columns,{'public.bookings':650000,'public.jobs_archive':2500000},undefined);
 assert.equal(mapping.table,'bookings');
 assert.equal(mapping.fields.reference.name,'booking_reference');
 assert.equal(mapping.fields.customerName.name,'passenger_name');
 assert.equal(mapping.fields.pickupAt.name,'pickup_time');
 assert.equal(mapping.fields.price.name,'passenger_price');
});

test('TaxiCRM schema mapper honours an explicit schema-qualified override',()=>{
 const columns=['id','status','pickup','destination'].flatMap(name=>[column('bookings',name),{...column('live_jobs',name),schema:'dispatch'}]);
 assert.equal(chooseTaxiCrmBookingMapping(columns,{},'dispatch.live_jobs').table,'live_jobs');
});

test('TaxiCRM schema mapper refuses an incomplete table',()=>{
 assert.throws(()=>chooseTaxiCrmBookingMapping([column('bookings','id'),column('bookings','status')]),TaxiCrmBookingSchemaError);
});

test('TaxiCRM schema mapper links canonical bookings to their locations',()=>{
 const columns=[
  ...['id','status','pickupDueTime','externalId'].map(name=>column('Booking',name)),
  ...['bookingId','type','address'].map(name=>column('BookingLocation',name)),
  ...['id','status','pickup_address','destination_address'].map(name=>column('needacab_bookings',name)),
 ];
 const mapping=chooseTaxiCrmBookingMapping(columns,{'public.Booking':650000,'public.needacab_bookings':12000},undefined);
 assert.equal(mapping.table,'Booking');
 assert.deepEqual(mapping.locationTable,{schema:'public',table:'BookingLocation'});
 assert.equal(mapping.fields.pickupAt.name,'pickupDueTime');
 assert.equal(mapping.fields.reference.name,'externalId');
});
