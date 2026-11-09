import {createHash} from 'node:crypto';
import {load} from 'cheerio';
export const councilSourceUrl='https://www.plymouth.gov.uk/roadworks';
export const councilUserAgent='NeedACabPlus-Roadworks/1.0 (+https://webapp.needacabplus.app)';
export type CouncilNotice={id:string;street:string;startDate:string;endDate:string;dateText:string;traffic:string;description:string|null;contractor:string|null;sourceUrl:string;anchor:string;contentHash:string};
const months=['january','february','march','april','may','june','july','august','september','october','november','december'];
const clean=(value:string)=>value.replace(/\s+/g,' ').trim();
export function councilDates(value:string):{startDate:string;endDate:string}{
 const expression=new RegExp('(\\d{1,2})(?:st|nd|rd|th)?\\s+('+months.join('|')+')\\s*(20\\d{2})?','gi'),parts=[...value.matchAll(expression)];
 if(!parts.length||parts.length>2)throw Error('COUNCIL_INVALID_DATE');
 const last=parts.at(-1)!,endYear=Number(last[3]);if(!endYear)throw Error('COUNCIL_MISSING_YEAR');
 const first=parts[0],firstMonth=months.indexOf(first[2].toLowerCase()),lastMonth=months.indexOf(last[2].toLowerCase());
 const startYear=first[3]?Number(first[3]):endYear-(firstMonth>lastMonth?1:0);
 const iso=(day:number,month:number,year:number)=>{const date=new Date(Date.UTC(year,month,day));if(date.getUTCFullYear()!==year||date.getUTCMonth()!==month||date.getUTCDate()!==day)throw Error('COUNCIL_INVALID_DATE');return date.toISOString().slice(0,10)};
 const startDate=iso(Number(first[1]),firstMonth,startYear),endDate=iso(Number(last[1]),lastMonth,endYear);
 if(startDate>endDate)throw Error('COUNCIL_REVERSED_DATE');return {startDate,endDate};
}
export function councilRoadKey(value:string){return clean(value.normalize('NFKC').toLowerCase().replace(/\([^)]*\)/g,'').replace(/&/g,' and ').replace(/[^\p{L}\p{N} ]/gu,' ').replace(/\brd\b/g,'road').replace(/\bst\b/g,'street'))}
export function parseCouncilNotices(html:string):CouncilNotice[]{
 if(html.length>1500000)throw Error('COUNCIL_PAGE_TOO_LARGE');
 const $=load(html),notices:CouncilNotice[]=[];
 $('h3').each((_,heading)=>{
  const fields:Record<string,string>={};
  $(heading).nextUntil('h2,h3').filter('p').each((_,paragraph)=>{const label=clean($(paragraph).find('strong').first().text()).replace(/:$/,'').toLowerCase();if(!['dates','traffic management','details','contractor'].includes(label))return;const value=clean($(paragraph).text()).replace(new RegExp('^'+label+'\\s*:\\s*','i'),'');fields[label]=value});
  if(!fields.dates)return;
  const street=clean($(heading).text());if(!street||street.length>300||fields.dates.length>250)throw Error('COUNCIL_INVALID_RECORD');
  const dates=councilDates(fields.dates),anchor=$(heading).attr('id')||councilRoadKey(street).replaceAll(' ','-');
  const identity=[councilRoadKey(street),dates.startDate,clean(fields.contractor||'').toLowerCase(),clean(fields['traffic management']||'').toLowerCase()];
  const body={street,...dates,dateText:fields.dates,traffic:(fields['traffic management']||'Not provided').slice(0,3000),description:fields.details?.slice(0,4000)||null,contractor:fields.contractor?.slice(0,300)||null,sourceUrl:councilSourceUrl+'#'+encodeURIComponent(anchor),anchor};
  notices.push({id:createHash('sha256').update(JSON.stringify(identity)).digest('hex'),...body,contentHash:createHash('sha256').update(JSON.stringify(body)).digest('hex')});
 });
 const distinct=[...new Map(notices.map(n=>[n.id,n])).values()];
 if(distinct.length<10||distinct.length>500)throw Error('COUNCIL_RECORD_COUNT_REVIEW_REQUIRED');return distinct;
}
