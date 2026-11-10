import type {PreviewItem} from '../street-manager/preview-data';
import type {TrafficFeed} from './tomtom';
import type {TrafficSnapshot} from './types';
export type DisplayFeed=TrafficFeed&{retainedAt?:string};
export type DisplayTraffic=Omit<TrafficSnapshot,'street'|'tomtom'>&{street:DisplayFeed;tomtom:DisplayFeed};
export function retainTraffic(previous:DisplayTraffic|null,next:TrafficSnapshot):DisplayTraffic{
 const source=(before:DisplayFeed|undefined,after:TrafficFeed):DisplayFeed=>after.status==='ok'||!before?.items.length?after:{...after,items:before.items,total:before.total,omitted:before.omitted,retainedAt:before.retainedAt||before.checkedAt};
 return {...next,street:source(previous?.street,next.street),tomtom:source(previous?.tomtom,next.tomtom)};
}
export function trafficSource(item:PreviewItem){return item.source==='tomtom'?'TomTom':item.source==='archive'?'Street Manager archive':item.source==='council'?'Plymouth Council':'Street Manager webhook'}
export function trafficKind(item:PreviewItem){
 if(item.type==='SECTION_58')return 'restriction';
 const label=item.traffic||'';
 if(/road.?closure|\bclosed\b|closure/i.test(label))return 'closure';
 if(/congestion|stationary traffic|slow traffic|traffic jam|queuing/i.test(label))return 'congestion';
 if(/roadworks|works|signals/i.test(label)||item.type==='PERMIT')return 'roadworks';
 return 'other';
}
export function visibleTraffic(items:PreviewItem[],source:string,state:string,kind:string,query:string){
 const search=query.trim().toLowerCase();
 return items.filter(item=>(source==='all'||source==='street'&&(item.source==='webhook'||item.source==='archive'||!item.source)||item.source===source)&&(state==='all'||state==='current'&&item.state!=='ended'&&item.state!=='planned'&&item.source!=='archive'||item.state===state)&&(kind==='all'||trafficKind(item)===kind)&&[item.title,item.street,item.reference,item.traffic,trafficSource(item)].join(' ').toLowerCase().includes(search));
}
