import type {PoolClient} from 'pg';
import {bookingPeriod} from '@/lib/booking-period';
import {withTaxiCrmReadOnly} from '@/lib/taxicrm-database';

type Field='id'|'reference'|'status'|'customerName'|'phone'|'pickup'|'destination'|'source'|'payment'|'fare'|'price'|'cost'|'createdAt'|'updatedAt'|'pickupAt'|'bookingType'|'driver'|'vehicle'|'passengers'|'luggage';
type Column={schema:string;table:string;name:string;dataType:string;udtName:string;ordinal:number};
export type TaxiCrmBookingMapping={schema:string;table:string;estimatedRows:number;score:number;fields:Partial<Record<Field,Column>>;locationTable?:{schema:string;table:string}};

const aliases:Record<Field,string[]>={
 id:['id','bookingid','jobid','reservationid'],reference:['bookingreference','bookingref','reference','externalid','externalbookingid','jobreference','jobnumber','bookingnumber','id'],
 status:['status','bookingstatus','jobstatus','state'],customerName:['customername','passengername','passenger','customer','name'],phone:['phone','telephone','telephonenumber','phonenumber','mobile','mobilenumber','customerphone'],
 pickup:['pickup','pickupaddress','pickupaddressformatted','origin','originaddress','fromaddress','addressfrom'],destination:['destination','destinationaddress','dropoff','dropoffaddress','toaddress','addressto'],
 source:['source','bookingsource','sourcechannel','channel','sourcesystem'],payment:['paymenttype','paymentmethod','payment','paymentprofile'],fare:['farepence','quotedfare','fare'],price:['price','passengerprice','totalprice','pricepence','totalpence'],cost:['cost','costpence'],
 createdAt:['createdat','createddate','bookedat','bookingdate','datecreated'],updatedAt:['updatedat','modifiedat','modifieddate','lastupdated','dateupdated'],pickupAt:['pickupduetime','pickuptime','pickupdate','pickupdateandtime','dueat','duetime','scheduledat','bookingtime'],
 bookingType:['bookingtype','typeofbooking','servicetype','service','jobtype'],driver:['drivername','driver','drivercallsign'],vehicle:['vehiclecallsign','vehicle','registration','vehicleregistration','callsign'],passengers:['passengers','passengercount','numberofpassengers'],luggage:['luggage','bags','luggagecount'],
};
const required:Field[]=['id','status','pickup','destination'];
const normalized=(value:string)=>value.toLowerCase().replace(/[^a-z0-9]/g,'');
const ident=(value:string)=>`"${value.replaceAll('"','""')}"`;
const tableName=(mapping:TaxiCrmBookingMapping)=>`${ident(mapping.schema)}.${ident(mapping.table)}`;
const globalCache=globalThis as unknown as {taxiCrmBookingMapping?:{expires:number;value:TaxiCrmBookingMapping}};

export class TaxiCrmBookingSchemaError extends Error{}
export class TaxiCrmBookingExportLimitError extends Error{}

function mappedFields(columns:Column[]){
 const byName=new Map(columns.map(column=>[normalized(column.name),column]));
 const fields:Partial<Record<Field,Column>>={};
 for(const [field,names] of Object.entries(aliases) as [Field,string[]][])for(const name of names){const column=byName.get(name);if(column){fields[field]=column;break}}
 return fields;
}

export function chooseTaxiCrmBookingMapping(columns:Column[],estimates:Record<string,number>={},override=process.env.TAXICRM_BOOKINGS_TABLE?.trim()):TaxiCrmBookingMapping{
 const grouped=new Map<string,Column[]>();
 for(const column of columns){const key=`${column.schema}.${column.table}`;grouped.set(key,[...(grouped.get(key)||[]),column])}
 const locations=grouped.get('public.BookingLocation');
 const hasLocations=Boolean(locations&&['bookingid','type','address'].every(name=>locations.some(column=>normalized(column.name)===name)));
 const requested=override?.split('.');
 const candidates=[...grouped.entries()].map(([key,tableColumns])=>{
  const [schema,table]=key.split('.',2),fields=mappedFields(tableColumns),name=normalized(table);
  const locationTable=table==='Booking'&&schema==='public'&&hasLocations?{schema:'public',table:'BookingLocation'}:undefined;
  let score=Object.keys(fields).length*5+required.filter(field=>fields[field]).length*25;
  if(locationTable)score+=250;
  if(name==='bookings')score+=100;else if(name.includes('booking'))score+=70;else if(name==='jobs'||name.includes('job'))score+=45;else if(name.includes('journey')||name.includes('reservation'))score+=25;
  if(name.includes('event')||name.includes('audit')||name.includes('history')||name.includes('archive'))score-=35;
  score+=Math.min(20,Math.log10(Math.max(1,estimates[key]||0))*3);
  return {schema,table,estimatedRows:estimates[key]||0,score,fields,locationTable};
 });
 const selected=requested?.length===2?candidates.find(item=>item.schema===requested[0]&&item.table===requested[1]):candidates.sort((a,b)=>b.score-a.score)[0];
 if(!selected)throw new TaxiCrmBookingSchemaError(override?`TaxiCRM booking table ${override} was not found.`:'No TaxiCRM tables are visible to the read-only account.');
 const missing=required.filter(field=>!selected.fields[field]&&!(selected.locationTable&&(field==='pickup'||field==='destination')));
 if(missing.length)throw new TaxiCrmBookingSchemaError(`TaxiCRM table ${selected.schema}.${selected.table} is missing mapped fields: ${missing.join(', ')}.`);
 return selected;
}

async function discover(client:PoolClient,refresh=false){
 if(!refresh&&globalCache.taxiCrmBookingMapping&&globalCache.taxiCrmBookingMapping.expires>Date.now())return globalCache.taxiCrmBookingMapping.value;
 const columns=(await client.query<Column>(`SELECT columns.table_schema schema,columns.table_name "table",columns.column_name name,columns.data_type "dataType",columns.udt_name "udtName",columns.ordinal_position ordinal
  FROM information_schema.columns columns JOIN information_schema.tables tables ON tables.table_schema=columns.table_schema AND tables.table_name=columns.table_name
  WHERE tables.table_type='BASE TABLE' AND columns.table_schema<>'information_schema' AND columns.table_schema NOT LIKE 'pg_%'
  ORDER BY columns.table_schema,columns.table_name,columns.ordinal_position`)).rows;
 const rows=(await client.query<{schema:string;table:string;estimated_rows:string|number}>(`SELECT namespace.nspname schema,class.relname "table",GREATEST(class.reltuples,0)::bigint estimated_rows FROM pg_class class JOIN pg_namespace namespace ON namespace.oid=class.relnamespace WHERE class.relkind IN ('r','p') AND namespace.nspname<>'information_schema' AND namespace.nspname NOT LIKE 'pg_%'`)).rows;
 const estimates=Object.fromEntries(rows.map(row=>[`${row.schema}.${row.table}`,Number(row.estimated_rows||0)]));
 const value=chooseTaxiCrmBookingMapping(columns,estimates);
 globalCache.taxiCrmBookingMapping={expires:Date.now()+300_000,value};return value;
}

export async function inspectTaxiCrmBookingMapping(refresh=true){
 return withTaxiCrmReadOnly(async client=>{
  const mapping=await discover(client,refresh);
  return {schema:mapping.schema,table:mapping.table,estimatedRows:mapping.estimatedRows,score:mapping.score,locationTable:mapping.locationTable,fields:Object.fromEntries(Object.entries(mapping.fields).map(([field,info])=>[field,info!.name]))};
 });
}

export async function inspectTaxiCrmBookingSchema(){
 return withTaxiCrmReadOnly(async client=>{
  const columns=(await client.query<Column>(`SELECT table_schema schema,table_name "table",column_name name,data_type "dataType",udt_name "udtName",ordinal_position ordinal
   FROM information_schema.columns WHERE table_schema<>'information_schema' AND table_schema NOT LIKE 'pg_%'
   ORDER BY table_schema,table_name,ordinal_position LIMIT 1500`)).rows;
  const foreignKeys=(await client.query<{table:string;column:string;referencedTable:string;referencedColumn:string}>(`SELECT source.relname "table",source_column.attname "column",target.relname "referencedTable",target_column.attname "referencedColumn"
   FROM pg_constraint con JOIN pg_class source ON source.oid=con.conrelid JOIN pg_class target ON target.oid=con.confrelid
   JOIN LATERAL unnest(con.conkey) WITH ORDINALITY source_key(number,position) ON true
   JOIN LATERAL unnest(con.confkey) WITH ORDINALITY target_key(number,position) ON target_key.position=source_key.position
   JOIN pg_attribute source_column ON source_column.attrelid=source.oid AND source_column.attnum=source_key.number
   JOIN pg_attribute target_column ON target_column.attrelid=target.oid AND target_column.attnum=target_key.number
   WHERE con.contype='f' AND source.relnamespace=(SELECT oid FROM pg_namespace WHERE nspname='public')
   ORDER BY source.relname LIMIT 250`)).rows;
  const enumValues=(await client.query<{type:string;value:string}>(`SELECT type.typname "type",entry.enumlabel value FROM pg_type type JOIN pg_enum entry ON entry.enumtypid=type.oid
   JOIN pg_namespace namespace ON namespace.oid=type.typnamespace WHERE namespace.nspname='public' ORDER BY type.typname,entry.enumsortorder`)).rows;
  return {columns,foreignKeys,enumValues};
 });
}

const select=(mapping:TaxiCrmBookingMapping,field:Field,alias:string)=>mapping.locationTable&&(field==='pickup'||field==='destination')?`locations.${field} AS ${ident(alias)}`:mapping.fields[field]?`booking.${ident(mapping.fields[field]!.name)} AS ${ident(alias)}`:`NULL AS ${ident(alias)}`;
const column=(mapping:TaxiCrmBookingMapping,field:Field)=>mapping.fields[field]?`booking.${ident(mapping.fields[field]!.name)}`:null;
function localTime(columnInfo:Column){const name=`booking.${ident(columnInfo.name)}`;if(columnInfo.dataType==='timestamp with time zone')return `(${name} AT TIME ZONE 'Europe/London')`;if(columnInfo.dataType==='date'||columnInfo.dataType==='timestamp without time zone')return name;return `(NULLIF(${name}::text,'')::timestamptz AT TIME ZONE 'Europe/London')`}
const valuesOf=(row:Record<string,unknown>,name:string)=>row[name]===null||row[name]===undefined?'':String(row[name]);
const dateOf=(row:Record<string,unknown>,name:string)=>row[name] instanceof Date?(row[name] as Date).toISOString():valuesOf(row,name);
const pricingAmount=(value:unknown,columnInfo?:Column):number|null=>{
 if(value===null||value===undefined||value==='')return null;
 const amount=Number(value);
 return Number.isFinite(amount)?amount/(columnInfo&&/(pence|penny|cents?)/i.test(columnInfo.name)?100:1):null;
};
const extraBookingColumns={
 originalBookingId:'originalBookingId',customerEmail:'customerEmail',accountName:'accountName',accountCode:'accountCode',companyName:'companyName',bookedBy:'bookedBy',ourReference:'ourReference',flightDetails:'flightDetails',driverNote:'driverNote',officeNote:'officeNote',accountAmount:'accountAmount',cashAmount:'cashAmount',cardAmount:'cardAmount',extraCost:'extraCost',gratuityAmount:'gratuityAmount',pricingTariff:'pricingTariff',dispatchedAt:'dispatchedAt',arrivedAt:'arrivedAt',completedAt:'completedAt',bookedAtTime:'bookedAtTime',
} as const;
export const normalizedStatus=(value:string)=>{
 const key=value.toUpperCase().replace(/[^A-Z0-9]/g,'');
 return ({BOOKED:'Booked',CREATED:'Booked',DISPATCHED:'Dispatched',ACCEPTED:'Driver Accepted',ARRIVED:'Arrived',POB:'Passenger On Board',PASSENGERONBOARD:'Passenger On Board',COMPLETED:'Completed',CANCELLED:'Cancelled',REJECTED:'Rejected',NOFARE:'No Fare',RUNNINGLATE:'Running Late',MODIFIED:'Modified'} as Record<string,string>)[key]||value;
};

export type TaxiCrmBookingPage={pastPeriod:boolean;bookings:Record<string,unknown>[];total:number;page:number;pageSize:number;summary:Record<string,number>;originSummary:{autocab:number;needACabPlus:number};nacServiceSummary:{priority:number;prebook:number;guarantee:number;unclassified:number};timingSummary:{asap:number;prebook:number};livePassengerOnBoard:number;period:ReturnType<typeof bookingPeriod>;statuses:string[];sources:string[];payments:string[];mapping:{schema:string;table:string;estimatedRows:number;fields:Record<string,string>};dataSource:'taxicrm'};

export async function readTaxiCrmBookings(params:URLSearchParams):Promise<TaxiCrmBookingPage>{
 const period=bookingPeriod(params),exporting=params.get('export')==='csv',page=Math.max(1,Number.parseInt(params.get('page')||'1',10)||1),requestedSize=Number.parseInt(params.get('pageSize')||'20',10),pageSize=exporting?50_000:([10,20,50,100].includes(requestedSize)?requestedSize:20);
 const search=(params.get('search')||'').trim().slice(0,120),selectedStatuses=[...new Set(params.getAll('status').map(value=>value.trim().slice(0,60)).filter(Boolean))].slice(0,50),source=(params.get('source')||'').trim().slice(0,100),payment=(params.get('payment')||'').trim().slice(0,100);
 return withTaxiCrmReadOnly(async client=>{
  const mapping=await discover(client),values:unknown[]=[],conditions:string[]=[];
  const add=(value:unknown)=>{values.push(value);return `$${values.length}`};
  const textFields=(['id','reference','customerName','phone','pickup','destination','driver','vehicle'] as Field[]).map(field=>column(mapping,field)).filter(Boolean) as string[];
  if(search){const placeholder=add(`%${search}%`);const searchable=textFields.map(name=>`COALESCE(${name}::text,'') ILIKE ${placeholder}`);if(mapping.locationTable)searchable.push(`EXISTS (SELECT 1 FROM ${ident(mapping.locationTable.schema)}.${ident(mapping.locationTable.table)} search_location WHERE search_location."bookingId"=booking.${ident(mapping.fields.id!.name)} AND search_location.address ILIKE ${placeholder})`);conditions.push(`(${searchable.join(' OR ')})`)}
  const statusColumn=column(mapping,'status')!;
  if(selectedStatuses.length){const allowed=selectedStatuses.flatMap(item=>item==='Booked'?['BOOKED','CREATED']:item==='Driver Accepted'?['ACCEPTED']:item==='Passenger On Board'?['POB','PASSENGER-ON-BOARD','PASSENGER_ON_BOARD']:item==='No Fare'?['NOFARE','NO_FARE']:[item.toUpperCase().replaceAll(' ','_')]);conditions.push(`${statusColumn}::text=ANY(${add(allowed)}::text[])`)}
  const sourceColumn=column(mapping,'source');if(source&&sourceColumn)conditions.push(`${sourceColumn}::text=${add(source)}`);
  const paymentColumn=column(mapping,'payment');if(payment&&paymentColumn)conditions.push(`${paymentColumn}::text=${add(payment)}`);
  const timeInfo=mapping.fields.pickupAt||mapping.fields.createdAt||mapping.fields.updatedAt;
  if(period.start&&period.end&&timeInfo){const time=localTime(timeInfo);conditions.push(`${time}::date BETWEEN ${add(period.start)}::date AND ${add(period.end)}::date`);if(period.period==='custom'){conditions.push(`${time}::time BETWEEN ${add(period.fromTime)}::time AND ${add(period.toTime)}::time`)}}
  const where=conditions.length?`WHERE ${conditions.join(' AND ')}`:'',table=`${tableName(mapping)} booking`;
  const locationsJoin=mapping.locationTable?`LEFT JOIN LATERAL (SELECT max(address) FILTER (WHERE type::text='PICKUP') pickup,max(address) FILTER (WHERE type::text='DESTINATION') destination FROM ${ident(mapping.locationTable.schema)}.${ident(mapping.locationTable.table)} WHERE "bookingId"=booking.${ident(mapping.fields.id!.name)}) locations ON true`:'';
  const typeColumn=column(mapping,'bookingType'),referenceColumn=column(mapping,'reference')||column(mapping,'id')!;
  const ourReference=mapping.table==='Booking'&&mapping.schema==='public'?`booking."ourReference"`:null;
  const directExpression=`(${[sourceColumn?`lower(COALESCE(${sourceColumn}::text,'')) LIKE '%need a cab%' OR lower(COALESCE(${sourceColumn}::text,'')) LIKE '%webapp%'`:null,`COALESCE(${referenceColumn}::text,'') ~* '^NAC-'`,ourReference?`COALESCE(${ourReference},'') ~* '^NAC-'`:null].filter(Boolean).join(' OR ')})`;
  const [countRows,summaryRows,statusRows,sourceRows,paymentRows,typeRows,originRows]=await Promise.all([
   client.query<{total:string}>(`SELECT COUNT(*)::text total FROM ${table} ${where}`,values),
   client.query<{status:string;total:string}>(`SELECT COALESCE(${statusColumn}::text,'Unknown') status,COUNT(*)::text total FROM ${table} ${where} GROUP BY 1`,values),
   client.query<{value:string}>(`SELECT DISTINCT ${statusColumn}::text value FROM ${table} WHERE ${statusColumn} IS NOT NULL ORDER BY 1 LIMIT 100`),
   sourceColumn?client.query<{value:string}>(`SELECT DISTINCT ${sourceColumn}::text value FROM ${table} WHERE ${sourceColumn} IS NOT NULL ORDER BY 1 LIMIT 100`):Promise.resolve({rows:[]}),
   paymentColumn?client.query<{value:string}>(`SELECT DISTINCT ${paymentColumn}::text value FROM ${table} WHERE ${paymentColumn} IS NOT NULL ORDER BY 1 LIMIT 100`):Promise.resolve({rows:[]}),
   typeColumn?client.query<{value:string;total:string;direct:string}>(`SELECT lower(COALESCE(${typeColumn}::text,'')) value,COUNT(*)::text total,COUNT(*) FILTER(WHERE ${directExpression})::text direct FROM ${table} ${where} GROUP BY 1`,values):Promise.resolve({rows:[]}),
   client.query<{direct:string}>(`SELECT COUNT(*) FILTER(WHERE ${directExpression})::text direct FROM ${table} ${where}`,values),
  ]);
  const total=Number(countRows.rows[0]?.total||0),totalPages=Math.max(1,Math.ceil(total/pageSize)),safePage=exporting?1:Math.min(page,totalPages),orderInfo=mapping.fields.updatedAt||mapping.fields.createdAt||mapping.fields.pickupAt;
  if(exporting&&total>pageSize)throw new TaxiCrmBookingExportLimitError('This export exceeds 50,000 bookings. Choose a shorter date range or apply filters.');
  const rowValues=[...values,pageSize,(safePage-1)*pageSize];
  const fields:[Field,string][]=[['id','id'],['reference','reference'],['status','status'],['customerName','customer_name'],['phone','phone'],['pickup','pickup'],['destination','destination'],['source','source'],['payment','payment'],['fare','fare'],['price','price'],['cost','cost'],['createdAt','created_at'],['updatedAt','updated_at'],['pickupAt','pickup_at'],['bookingType','booking_type'],['driver','driver'],['vehicle','vehicle'],['passengers','passengers'],['luggage','luggage']];
  const rawPricing=mapping.schema==='public'&&mapping.table==='Booking'?`,COALESCE(booking."rawPayload" #>> '{Pricing,Price}',booking."rawPayload" #>> '{Pricing,price}',booking."rawPayload" #>> '{pricing,price}') raw_price,COALESCE(booking."rawPayload" #>> '{Pricing,Cost}',booking."rawPayload" #>> '{Pricing,cost}',booking."rawPayload" #>> '{pricing,cost}') raw_cost`:`,NULL raw_price,NULL raw_cost`;
  const extraSelect=Object.entries(extraBookingColumns).map(([alias,name])=>mapping.schema==='public'&&mapping.table==='Booking'?`booking.${ident(name)} AS ${ident('extra_'+alias)}`:`NULL AS ${ident('extra_'+alias)}`).join(',');
  const data=await client.query<Record<string,unknown>>(`SELECT ${fields.map(([field,alias])=>select(mapping,field,alias)).join(',')}${rawPricing},${extraSelect} FROM ${table} ${locationsJoin} ${where} ORDER BY ${orderInfo?`booking.${ident(orderInfo.name)}`:`booking.${ident(mapping.fields.id!.name)}`} DESC NULLS LAST LIMIT $${rowValues.length-1} OFFSET $${rowValues.length}`,rowValues);
  const bookings=data.rows.map(row=>{const id=valuesOf(row,'id'),reference=valuesOf(row,'reference')||id,status=normalizedStatus(valuesOf(row,'status')||'Unknown'),pickupAt=dateOf(row,'pickup_at'),createdAt=dateOf(row,'created_at')||pickupAt||new Date(0).toISOString(),updatedAt=dateOf(row,'updated_at')||createdAt,price=pricingAmount(row.price,mapping.fields.price)??pricingAmount(row.raw_price),cost=pricingAmount(row.cost,mapping.fields.cost)??pricingAmount(row.raw_cost),fare=pricingAmount(row.fare,mapping.fields.fare),farePenceValue=Math.round((price??fare??0)*100),extraData=Object.fromEntries(Object.keys(extraBookingColumns).map(key=>[key,row['extra_'+key]??null]));return {id,external_booking_id:reference,original_booking_id:row.extra_originalBookingId?String(row.extra_originalBookingId):null,name:valuesOf(row,'customer_name')||'Unknown passenger',phone:valuesOf(row,'phone')||'Not supplied',customer_email:row.extra_customerEmail?String(row.extra_customerEmail):null,passengers:row.passengers===null?null:Number(row.passengers),luggage:row.luggage===null?null:Number(row.luggage),pickup:valuesOf(row,'pickup')||'—',destination:valuesOf(row,'destination')||'—',via_points:[],pickup_note:row.extra_driverNote?String(row.extra_driverNote):'',pickup_data:null,destination_data:null,vias_data:null,driver_data:row.driver?{name:String(row.driver)}:null,vehicle_data:row.vehicle?{registration:String(row.vehicle),vehicleCallsign:String(row.vehicle)}:null,pricing_data:{price,cost,fare,accountAmount:pricingAmount(row.extra_accountAmount),cashAmount:pricingAmount(row.extra_cashAmount),cardAmount:pricingAmount(row.extra_cardAmount),extraCost:pricingAmount(row.extra_extraCost),gratuity:pricingAmount(row.extra_gratuityAmount),tariff:row.extra_pricingTariff},timeline_data:{bookedAt:row.extra_bookedAtTime||createdAt,scheduledAt:pickupAt||null,dispatchedAt:row.extra_dispatchedAt,arrivedAt:row.extra_arrivedAt,completedAt:row.extra_completedAt},notes_data:{driverNote:row.extra_driverNote,officeNote:row.extra_officeNote,flightDetails:row.extra_flightDetails},extra_data:extraData,booking_type:valuesOf(row,'booking_type')||null,source:valuesOf(row,'source')||'TaxiCRM',payment_type:valuesOf(row,'payment')||null,priority:null,street_pickup:null,vehicle:valuesOf(row,'vehicle')||'',fare_pence:farePenceValue,status,last_event_type:null,raw_payload:null,created_at:createdAt,updated_at:updatedAt,pickup_day:pickupAt?pickupAt.slice(0,10):null}});
  const summary:Record<string,number>={};for(const row of summaryRows.rows){const status=normalizedStatus(row.status);summary[status]=(summary[status]||0)+Number(row.total)}
  const lower=(value:string)=>value.toLowerCase(),countMatching=(test:(value:string)=>boolean)=>Object.entries(summary).reduce((sum,[name,count])=>sum+(test(lower(name))?count:0),0),typeCount=(test:(value:string)=>boolean,direct=false)=>typeRows.rows.reduce((sum,row)=>sum+(test(row.value)?Number(direct?row.direct:row.total):0),0);
  const needACabPlus=Number(originRows.rows[0]?.direct||0),priority=typeCount(value=>value.includes('priority'),true),guarantee=typeCount(value=>value.includes('guarantee'),true),prebookOnly=typeCount(value=>value.includes('prebook')&&!value.includes('guarantee'),true);
  const asap=typeCount(value=>value.includes('asap')||value.includes('priority')),prebook=typeCount(value=>value.includes('prebook')||value.includes('scheduled')||value.includes('guarantee'));
  const pastPeriod=Boolean(period.end&&period.end<bookingPeriod(new URLSearchParams()).start!);
  return {pastPeriod,bookings,total,page:safePage,pageSize,summary,originSummary:{autocab:Math.max(0,total-needACabPlus),needACabPlus},nacServiceSummary:{priority,prebook:prebookOnly,guarantee,unclassified:Math.max(0,needACabPlus-priority-prebookOnly-guarantee)},timingSummary:{asap,prebook},livePassengerOnBoard:countMatching(value=>value==='passenger on board'),period,statuses:[...new Set(statusRows.rows.map(row=>normalizedStatus(row.value)))],sources:sourceRows.rows.map(row=>row.value),payments:paymentRows.rows.map(row=>row.value),mapping:{schema:mapping.schema,table:mapping.table,estimatedRows:mapping.estimatedRows,fields:Object.fromEntries(Object.entries(mapping.fields).map(([field,info])=>[field,info!.name]))},dataSource:'taxicrm'};
 });
}
