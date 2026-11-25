export const normalPlace=(s:string)=>s.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/crown plaza/g,'crowne plaza').replace(/[^a-z0-9]+/g,' ').trim();
const branches=['discharge lounge','outpatients','emergency department','a e','ward','pharmacy','car park','carpark','maternity','dermatology','oncology','marco pierre','top floor'];
export function voicePlaceScore(label:string,query:string){
 const text=normalPlace(label),q=normalPlace(query),first=normalPlace(label.split(',')[0]);let score=0;
 if(first===q)score+=30;else if(first.startsWith(q+' '))score+=30;
 for(const branch of branches)if(text.includes(branch))score+=q.includes(branch)?100:-75;
 const main=/\bmain (?:entrance|reception)\b/.test(text),wantsMain=/\bmain (?:entrance|reception)\b/.test(q);
 if(main&&/\bhospital\b/.test(q))score+=wantsMain?120:35;
 if(wantsMain&&!main)score-=45;
 return score;
}
export function basePlaceLabel(label:string){const clean=label.split(',')[0].replace(/\(free[ -]?phone\)/ig,'').replace(/\(hotel\)/ig,'').trim();return /^(.+?\bhospital)\b/i.exec(clean)?.[1]||clean;}
export function contextualPlaceQuery(spoken:string,previousLabel?:string){
 const value=spoken.trim().replace(/^(?:no[,.]?\s*)?(?:i (?:want(?: to go)?|meant|mean|would like)(?:\s+to)?\s+)/i,'').replace(/\s+instead$/i,'').trim();
 if(!previousLabel)return value;
 const clean=previousLabel.split(',')[0].replace(/\(free[ -]?phone\)/ig,'').replace(/\(hotel\)/ig,'').trim();
 const hospital=/^(.+?\bhospital)\b/i.exec(clean)?.[1],detail=/\b(main (?:reception|entrance)|discharge lounge|(?:north|south|east|west) entrance|a&e|emergency department|outpatients|car ?park\s*[a-z]?)\b/i.exec(value)?.[0];
 if(/\bfree[ -]?phone\b/i.test(value))return hospital||clean;
 if(detail&&hospital){const base=normalPlace(hospital).split(' ').filter(w=>w!=='hospital');const q=normalPlace(value);if(!/\bhospital\b/i.test(value)||base.every(w=>q.includes(w)))return hospital+' '+detail;}
 return value;
}
export function broadHospitalQuery(query:string){
 if(!/\bmain (?:reception|entrance)\b/i.test(query))return null;
 return /^(.+?\bhospital)\b/i.exec(query)?.[1]||null;
}

export function excludesPlace(label:string,term:string){const text=normalPlace(label),q=normalPlace(term).replace(/\b(?:the|one|option|please)\b/g,'').replace(/\s+/g,' ').trim();if(!q)return false;if(/\bmain (?:reception|entrance)\b/.test(q)&&/\bmain (?:reception|entrance)\b/.test(text))return true;return text.includes(q);}
