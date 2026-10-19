type Choice={address:string};
// Return the first missing or repeated stop. A complete journey opens ride choices.
export function nextJourneyStop(choices:Record<string,Choice>,viaCount:number):string|null{
 const seen=new Set<string>();
 for(const key of ['pickup',...Array.from({length:viaCount},(_,i)=>`via-${i}`),'destination']){
  const address=choices[key]?.address.trim().toLowerCase();
  if(!address||seen.has(address))return key;
  seen.add(address);
 }
 return null;
}
