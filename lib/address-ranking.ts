type Suggestion={address:string;fullAddress?:Record<string,unknown>|null;placeID?:string|null};
const normal=(value:string)=>value.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim();
const words=(value:string)=>normal(value).split(' ').filter(Boolean).map(word=>word.length>4?word.replace(/s$/,''):word);
export function rankAddressSuggestions<T extends Suggestion>(items:T[],query:string,city='Plymouth'):T[]{
 const preferred=normal(city),terms=words(query);
 const score=(item:T)=>{
  const parts=item.address.split(',').map(part=>normal(part));
  const town=typeof item.fullAddress?.town==='string'?normal(item.fullAddress.town):'';
  const local=town===preferred||parts.slice(1).some(part=>part===preferred||(part.startsWith(preferred+' ')&&/^[a-z]{1,2}[0-9]/.test(part.slice(preferred.length+1))));
  const name=words(parts[0]||''),matches=terms.filter(term=>name.includes(term)).length;
  const explicitTown=Boolean(town&&town!==preferred&&words(town).every(word=>terms.includes(word)));
  const venue=!/^\d/.test(parts[0]||'')&&!/\b(road|street|lane|avenue|close|drive|way|terrace)$/.test(parts[0]||'');
  return (explicitTown?200:local?100:0)+matches*10+(name.join(' ')===terms.join(' ')?8:0)+(venue?5:0);
 };
 return items.map((item,index)=>({item,index,score:score(item)})).sort((a,b)=>b.score-a.score||a.index-b.index).map(entry=>entry.item);
}
export function pickupSearchCity(address:Record<string,unknown>|null|undefined){
 const town=address?.town;
 return typeof town==='string'&&town.trim().length>1&&town.length<=80?town.trim():'Plymouth';
}
