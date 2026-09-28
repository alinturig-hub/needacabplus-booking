import {fetchAuditBooking} from './audit-fetch.mjs';

// Only use an explicit original ID received from Autocab; never derive IDs.
export async function readAuditBooking(reference,originalReference,headers,read=fetchAuditBooking){
 const url=id=>`https://autocab-api.azure-api.net/booking/v1/booking/${id}`;
 if(!/^[1-9]\d*$/.test(reference))throw new Error('Invalid reference');
 try{return {remote:await read(url(reference),headers),lookupReference:reference}}
 catch(error){
  if(error.message!=='HTTP_404'||!/^[1-9]\d*$/.test(originalReference||'')||originalReference===reference)throw error;
 }
 try{
  const remote=await read(url(originalReference),headers);
  const returnedOriginal=remote?.archivedBooking?.originalAutoID;
  if(returnedOriginal!=null&&String(returnedOriginal)!==originalReference)throw new Error('REFERENCE_MISMATCH');
  return {remote,lookupReference:originalReference,originalReferenceAttempted:originalReference};
 }catch(error){error.originalReferenceAttempted=originalReference;throw error}
}
