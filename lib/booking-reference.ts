const NEED_A_CAB_PLUS_PREFIX='NAC-';

export function needACabPlusReference(id:string){
 const value=id.trim();
 if(!value)throw new Error('A booking reference ID is required.');
 return NEED_A_CAB_PLUS_PREFIX+value;
}

export function isNeedACabPlusReference(value:unknown){
 return typeof value==='string'&&/^NAC-\S+$/i.test(value.trim());
}

export function needACabPlusQuoteId(value:unknown){
 if(typeof value!=='string')return null;
 return value.trim().match(/^NAC-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i)?.[1]||null;
}

export type BookingReferenceRow={external_booking_id?:string|null;our_reference?:string|null;your_references?:unknown};

export function summarizeBookingReferences(rows:BookingReferenceRow[]){
 const slots=Array.from({length:8},(_,index)=>({slot:index+1,filled:0,examples:[] as string[]}));
 let ourReferenceFilled=0,needACabPlus=0;
 const otherExamples:{bookingId:string;value:string}[]=[];
 for(const row of rows){
  const ourReference=typeof row.our_reference==='string'?row.our_reference.trim():'';
  if(ourReference){
   ourReferenceFilled++;
   if(isNeedACabPlusReference(ourReference))needACabPlus++;
   else if(otherExamples.length<20)otherExamples.push({bookingId:String(row.external_booking_id||'Unknown'),value:ourReference});
  }
  const references=row.your_references&&typeof row.your_references==='object'&&!Array.isArray(row.your_references)?row.your_references as Record<string,unknown>:{};
  for(const entry of slots){
   const value=Object.entries(references).find(([key])=>key.toLowerCase()===`yourreference${entry.slot}`)?.[1];
   const text=typeof value==='string'||typeof value==='number'?String(value).trim():'';
   if(text){entry.filled++;if(entry.examples.length<5&&!entry.examples.includes(text))entry.examples.push(text)}
  }
 }
 return {total:rows.length,ourReference:{filled:ourReferenceFilled,empty:rows.length-ourReferenceFilled,needACabPlus,other:ourReferenceFilled-needACabPlus,otherExamples},yourReferences:slots};
}
