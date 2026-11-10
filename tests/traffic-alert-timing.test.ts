import {test} from 'node:test';
import assert from 'node:assert/strict';
import {formatTrafficTiming,composeTrafficMessage} from '../lib/traffic/message-timing';
import {tomtomItem} from '../lib/traffic/tomtom';
import {tomtomAlert} from '../lib/traffic/driver62-alerts';
import {councilAlert,type CouncilAlertRow} from '../lib/traffic/council-alerts';
import {activeRoadEvent,approachingClosure} from '../lib/street-manager/closure-alerts';
import type {PreviewRow} from '../lib/street-manager/preview-data';
import {vehicleMessageBody} from '../lib/street-manager/driver-message';
const now=Date.parse('2026-11-10T12:00:00Z');
test('known daily hours and full published dates are shown without inferring a recurring interval',()=>{
 assert.equal(formatTrafficTiming({from:'2026-11-10',to:'2026-11-20',hours:'09:00-17:00'}),'10-20 Nov 2026; 09:00-17:00 UK');
 assert.equal(formatTrafficTiming({from:'2026-12-31',to:'2027-01-02',hours:'24h'}),'31 Dec 2026-02 Jan 2027; 24h UK');
 assert.equal(formatTrafficTiming({from:'2026-11-10',to:'2026-11-20',hours:'19:00-06:00',overnight:true,weekdaysOnly:true}),'10-20 Nov 2026; 19:00-06:00 overnight Mon-Fri UK');
 const instants=formatTrafficTiming({from:'2026-11-10T09:00:00Z',to:'2026-11-20T17:00:00Z',expectedEnd:true});assert.equal(instants,'From 10 Nov 2026 09:00; Est. end 20 Nov 2026 17:00 UK');assert.ok(!instants.includes('09:00-17:00'));
});
test('UK clocks handle BST and missing/date-only ends retain their published precision',()=>{
 assert.equal(formatTrafficTiming({from:'2026-07-01T08:00:00Z',to:'2026-07-01T16:00:00Z',expectedEnd:true}),'01 Jul 2026 09:00-17:00 UK (est. end)');
 assert.equal(formatTrafficTiming({from:'2026-11-10T09:00:00Z',to:'2026-11-20',expectedEnd:true}),'From 10 Nov 2026 09:00; Est. end 20 Nov 2026 UK');
 assert.equal(formatTrafficTiming({from:'2026-11-10T09:00:00Z'}),'From 10 Nov 2026 09:00 UK');
 assert.equal(formatTrafficTiming({to:'2026-11-20',expectedEnd:true}),'Est. end 20 Nov 2026');
 assert.equal(formatTrafficTiming({from:'2026-11-10',to:'2026-11-20',startPlanned:true,expectedEnd:true}),'Planned 10-20 Nov 2026');
 assert.equal(formatTrafficTiming({from:'2026-11-10T09:00:00Z',to:'2026-11-10T17:00:00Z',startPlanned:true,expectedEnd:true}),'Planned 10 Nov 2026 09:00-17:00 UK');
 assert.equal(formatTrafficTiming({from:'invalid',to:'2026-02-31'}),'');assert.equal(formatTrafficTiming({from:'2026-11-10T09:00:00'}),'');assert.equal(formatTrafficTiming({from:'2026-02-31T09:00:00Z'}),'');assert.equal(formatTrafficTiming(), '');assert.equal(formatTrafficTiming({hours:'09:00-17:00\n'}),'');assert.equal(formatTrafficTiming({from:'2026-11-20',to:'2026-11-10'}),'');
});
test('location truncation preserves severity, source and complete dates within the Autocab limit',()=>{
 const timing={from:'2026-11-10',to:'2026-11-20',hours:'09:00-17:00'};
 const message=composeTrafficMessage('Council notice: a scheduled road closure nearby on ','x'.repeat(3000),'. Check signs.',timing);
 assert.ok(message.startsWith('Council notice: a scheduled road closure'));assert.ok(message.endsWith('10-20 Nov 2026; 09:00-17:00 UK'));assert.ok(message.includes('…'));assert.ok(message.length<=185);assert.doesNotThrow(()=>vehicleMessageBody('1530','[TRAFFIC TEST] '+message));
});
test('TomTom shows actual provider bounds, never the two-minute feed expiry as a reopening time',()=>{
 const item=tomtomItem({geometry:{type:'Point',coordinates:[-4.15,50.38]},properties:{id:'synthetic',iconCategory:8,from:'North Road West',timeValidity:'present',startTime:'2026-11-10T09:00:00Z',endTime:'2026-11-20T17:00:00Z',events:[{description:'Closed',iconCategory:8}]}},now)!;
 const event=tomtomAlert(item,now)!;assert.ok(event.message!.includes('20 Nov 2026 17:00'));assert.ok(!event.message!.includes('12:02'));assert.equal(event.endsAt,now+120000);
 const ongoing=tomtomAlert({...item,tomtom:{...item.tomtom!,endsAt:null}},now)!;assert.ok(!ongoing.message!.includes('Est. end'));assert.ok(ongoing.message!.includes('10 Nov 2026 09:00'));
});
test('Council uses the full notice period and explicit daily/overnight hours, not only today’s active slice',()=>{
 const row:CouncilAlertRow={id:'synthetic',notice_data:{id:'synthetic',street:'North Road West',startDate:'2026-11-10',endDate:'2026-11-20',dateText:'10 November to 20 November 2026',traffic:'Road closure, 9am to 5pm, weekdays',description:null,contractor:null,sourceUrl:'https://www.plymouth.gov.uk/roadworks',anchor:'synthetic',contentHash:'synthetic'},geometry:{type:'Point',coordinates:[-4.15,50.38]},location_quality:'verified',location_basis:'junction',source_checked_at:new Date(now).toISOString()};
 const event=councilAlert(row,now)!;assert.ok(event.message!.includes('10-20 Nov 2026; 09:00-17:00 Mon-Fri UK'));assert.ok(event.message!.includes('scheduled'));assert.doesNotThrow(()=>vehicleMessageBody('1530','[TRAFFIC TEST] '+event.message));
 const nightNow=Date.parse('2026-11-11T05:00:00Z'),night=councilAlert({...row,notice_data:{...row.notice_data,traffic:'Road closure, 7pm to 6am'},source_checked_at:new Date(nightNow).toISOString()},nightNow)!;assert.ok(night.message!.includes('19:00-06:00 overnight UK'));assert.ok(night.message!.includes('10-20 Nov 2026'));
});
test('Street Manager date-only forecasts do not invent a midnight closing clock',()=>{
 const row:PreviewRow={object_type:'PERMIT',object_reference:'synthetic',event_type:'WORK_START',event_time:'2026-11-10T09:10:00Z',received_at:'2026-11-10T09:11:00Z',event_data:{object_data:{highway_authority_swa_code:'1160',street_name:'NORTH RD WEST',usrn:'synthetic',work_status_ref:'in_progress',permit_status:'granted',traffic_management_type_ref:'road_closure',actual_start_date_time:'2026-11-10T09:00:00Z',proposed_end_date:'2026-11-20T00:00:00Z',works_location_coordinates:'POINT(248000 55000)'}}};
 const event=activeRoadEvent(row,now)!;assert.equal(event.timing?.to,'2026-11-20');
 const fix={driverId:'1364',vehicleId:'1530',latitude:50.38,longitude:-4.151,at:now-1000},old={...fix,longitude:-4.152,at:now-11000};
 const candidate=approachingClosure(fix,old,{...event,geometry:{type:'Point',coordinates:[-4.15,50.38]}},now)!;
 assert.ok(candidate.message.includes('20 Nov 2026'));assert.ok(!candidate.message.includes('21 Nov'));assert.ok(!candidate.message.includes('00:00'));assert.ok(candidate.message.includes('is reported closed'));
});
