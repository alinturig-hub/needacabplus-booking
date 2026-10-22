const obj=x=>x&&typeof x==='object'&&!Array.isArray(x)?x:null;
const text=x=>typeof x==='string'&&x.trim()?x.trim():typeof x==='number'&&Number.isFinite(x)?String(x):null;
const get=(o,k)=>Object.entries(obj(o)||{}).find(([key])=>key.toLowerCase()===k.toLowerCase())?.[1];
const has=(o,k)=>Object.keys(obj(o)||{}).some(key=>key.toLowerCase()===k.toLowerCase());
const val=(o,...keys)=>{for(const k of keys){const x=text(get(o,k));if(x)return x}return null};
const state=x=>(text(x)||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const archiveStates={COMPLETED:'COMPLETED',EXCHANGEDCOMPLETED:'COMPLETED',CANCELLED:'CANCELLED',EXCHANGEDCANCELLED:'CANCELLED',NOJOB:'ARCHIVEDNOJOB',EXCHANGEDNOJOB:'ARCHIVEDNOJOB',DISPATCHED:'ARCHIVEDDISPATCHED',RECOVER:'ARCHIVEDRECOVERED',SUSPENDED:'ARCHIVEDSUSPENDED',SKIPPED:'ARCHIVEDSKIPPED'};
const sourceRef=doc=>val(get(doc,'archivedBooking'),'originalAutoID')||val(doc,'BookingId','autocab_booking_id','original_booking_id','id');
function explicitClear(doc,kind){return (has(doc,kind)&&get(doc,kind)===null)||(has(doc,kind+'Details')&&get(doc,kind+'Details')===null)||(obj(get(doc,kind+'Details'))&&has(get(doc,kind+'Details'),kind)&&get(get(doc,kind+'Details'),kind)===null)}
function entity(doc,kind){
 const archived=obj(get(doc,'archivedBooking'));
 const payload=obj(get(get(doc,kind+'Details'),kind))||obj(get(doc,kind))||obj(get(archived,kind));
 if(payload)return kind==='Driver'?{
  id:val(payload,'id'),callsign:val(payload,'callsign'),forename:val(payload,'forename','firstName'),surname:val(payload,'surname','lastName'),
  name:val(payload,'fullName','name','driverName')||val(archived,'driverName'),badgeNumber:val(payload,'badgeNumber')||val(archived,'badgeNumber'),phone:val(payload,'mobile','telephoneNumber','telephone','phone'),
 }:{id:val(payload,'id'),callsign:val(payload,'callsign'),registration:val(payload,'registration')||val(archived,'regNumber'),plateNumber:val(payload,'plateNumber')||val(archived,'plateNumber'),make:val(payload,'make'),model:val(payload,'model'),colour:val(payload,'colour','color')};
 if(!has(doc,'autocab_booking_id'))return null;
 const numeric=x=>Boolean(x&&/^\d+$/.test(x));
 const name=val(doc,'driver_name'),reg=val(doc,'vehicle_registration');
 return kind==='Driver'?{id:val(doc,'driver_autocab_id'),callsign:numeric(name)?name:null,name:name&&!numeric(name)?name:null,phone:val(doc,'driver_phone'),badgeNumber:val(doc,'driver_badge_number')}:
 {id:val(doc,'vehicle_autocab_id'),callsign:numeric(reg)?reg:null,registration:reg&&!numeric(reg)?reg:null,plateNumber:val(doc,'vehicle_plate_number'),make:val(doc,'vehicle_make'),model:val(doc,'vehicle_model'),colour:val(doc,'vehicle_color','vehicle_colour')};
}
export const canonicalAssignmentFields={driver:{callsign:'driverCallSign',forename:'driverForename',surname:'driverSurname',badgeNumber:'driverBadgeNumber'},vehicle:{callsign:'vehicleCallSign',registration:'vehicleRegistration',plateNumber:'vehiclePlateNumber'}};
const identity=(row,kind)=>text(row[kind==='driver'?'driverId':'vehicleId']);
export function recoverAssignmentDetails(row,documents,{fillOnly=true,onlyWhenAddsInformation=false}={}){
 const prior=obj(row.assignmentDetails)||{};
 const details={version:1,provider:row.provider,bookingRef:row.externalId,driver:null,vehicle:null,sources:{}};
 const patch={};let matched=0;let extra=false;
 const validDocs=documents.filter(d=>{const ref=sourceRef(d.payload);return !ref||ref===text(row.externalId)});
 const own=validDocs.find(d=>d.kind==='canonical_raw');
 for(const [kind,idKey] of [['driver','driverId'],['vehicle','vehicleId']]){
  const title=kind==='driver'?'Driver':'Vehicle',canonical=canonicalAssignmentFields[kind];
  if((own&&explicitClear(own.payload,title))||validDocs.some(d=>d.kind==='webhook'&&explicitClear(d.payload,title)&&!fillOnly))continue;
  let id=identity(row,kind),recovered=null;
  if(!id&&state(row.status)!=='REJECTED')for(const document of validDocs){
   const incoming=entity(document.payload,title);if(!incoming?.id)continue;
   const archive=get(document.payload,'archivedBooking');
   const archiveSafe=sourceRef(document.payload)===text(row.externalId)&&archiveStates[state(get(archive,'reason'))]===state(row.status);
   const currentSafe=document.kind==='canonical_raw'&&!archive&&sourceRef(document.payload)===text(row.externalId)&&!has(document.payload,'autocab_booking_id');
   if(!archiveSafe&&!currentSafe)continue;
   if(text(row[canonical.callsign])&&incoming.callsign&&text(row[canonical.callsign])!==incoming.callsign)continue;
   id=incoming.id;recovered=incoming;patch[idKey]=id;break;
  }
  const old=obj(prior[kind]);
  const keepOld=prior.provider===row.provider&&prior.bookingRef===row.externalId&&old&&(id?val(old,'id')===id:old.legacy===true&&prior.bookingRef===row.externalId);
  const target=keepOld?{...old}:{id};
  if(recovered?.callsign&&!text(row[canonical.callsign]))target.callsign=recovered.callsign;
  const provenance={...(keepOld?obj(prior.sources?.[kind])||{}:{})};
  for(const [key,column] of Object.entries(canonical)){const saved=text(row[column]);if(saved)target[key]=saved}
  for(const document of validDocs){
   const incoming=entity(document.payload,title);if(!incoming)continue;
   const ownLegacy=document.kind==='canonical_raw'&&has(document.payload,'autocab_booking_id')&&sourceRef(document.payload)===text(row.externalId);
   if(id){if(incoming.id!==id&&!(ownLegacy&&!incoming.id))continue}
   else if(!ownLegacy)continue;
   if(text(target.callsign)&&incoming.callsign&&text(target.callsign)!==incoming.callsign)continue;
   matched++;
   for(const [key,value] of Object.entries(incoming)){
    if(key==='id'||!text(value))continue;
    const column=canonical[key];
    const misplacedCallsign=kind==='vehicle'&&key==='registration'&&column&&/^\d+$/.test(text(row[column])||'')&&text(row[column])===incoming.callsign&&/\p{L}/u.test(value);
    if(column&&text(row[column])&&!misplacedCallsign)continue;
    if(fillOnly&&text(target[key])&&!misplacedCallsign)continue;
    if(misplacedCallsign)patch[column]=value;
    target[key]=value;provenance[key]={kind:document.kind,id:document.id};
   }
  }
  if(!id&&!Object.entries(target).some(([k,v])=>!['id','legacy'].includes(k)&&text(v)))continue;
  if(!id)target.legacy=true;else {target.id=id;delete target.legacy}
  for(const [key,column] of Object.entries(canonical))if(!text(row[column])&&text(target[key]))patch[column]=target[key];
  for(const key of kind==='driver'?['phone','name']:['make','model','colour'])if(text(target[key]))extra=true;
  details[kind]=target;details.sources[kind]=provenance;
 }
 const changed=JSON.stringify(prior)!==JSON.stringify(details);
 const persist=changed&&(!onlyWhenAddsInformation||Object.keys(patch).length>0||extra||Object.keys(prior).length>0);
 return {details,patch,changed:persist||Object.keys(patch).length>0,matched};
}
