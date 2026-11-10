import {driver62TomtomFeed,tomtomDriver62,combineAlertEvents,type TomtomPilotStatus} from '../traffic/driver62-alerts';
import type {PoolClient} from 'pg';
import {fleetLifecycleJoins,fleetLiveEligibility} from '../fleet-lifecycle';
import {activeRoadEvent,trafficEventPriority,approachingClosure,alertPolicy,type DriverFix,type ClosureCandidate,type ActiveRoadEvent} from './closure-alerts';
import {PLYMOUTH_SWA_CODE} from './scope';
import type {PreviewRow} from './preview-data';
export type AlertPlan={checkedAt:string;activeClosures:number;activeRoadworks?:number;activeRestrictions?:number;activeIncidents?:number;activeCongestion?:number;activeEvents?:number;tomtom?:TomtomPilotStatus;trackedDrivers:number;closures:(ActiveRoadEvent&{sourceId:string})[];events?:(ActiveRoadEvent&{sourceId:string})[];candidates:ClosureCandidate[]};
type TrackRow={driver_callsign:string|null;driver_id:string;vehicle_id:string;latitude:number;longitude:number;recorded_at:Date;previous_latitude:number;previous_longitude:number;previous_at:Date};
export async function loadAlertPlan(client:Pick<PoolClient,'query'>,now=Date.now(),options:{refreshTomtom?:boolean}={}):Promise<AlertPlan>{
 const source=(await client.query<PreviewRow>(`WITH scoped AS (
 SELECT *,row_number() OVER(PARTITION BY object_type,COALESCE(NULLIF(event_data#>>'{object_data,work_reference_number}',''),object_reference) ORDER BY event_time DESC,received_at DESC,event_reference DESC) AS latest,
 count(*) OVER(PARTITION BY object_type,COALESCE(NULLIF(event_data#>>'{object_data,work_reference_number}',''),object_reference),event_time) AS same_time_versions
 FROM street_manager_events WHERE btrim(event_data#>>'{object_data,highway_authority_swa_code}')=$1)
 SELECT * FROM scoped WHERE latest=1`,[PLYMOUTH_SWA_CODE])).rows;
 const streetEvents=source.map(row=>{const closure=activeRoadEvent(row,now);return closure?{...closure,sourceId:row.object_type+':'+row.object_reference}:null}).filter(c=>c!==null);
 const tracks=(await client.query<TrackRow>(`SELECT driver.callsign AS driver_callsign,driver."externalId" AS driver_id,vehicle."externalId" AS vehicle_id,
 position.latitude,position.longitude,position.recorded_at,previous.latitude AS previous_latitude,previous.longitude AS previous_longitude,previous.recorded_at AS previous_at
 FROM public."Vehicle" vehicle JOIN public."Driver" driver ON driver.id=vehicle."currentDriverId"
 ${fleetLifecycleJoins}
 JOIN LATERAL (SELECT p.* FROM driver_positions p WHERE p.driver_id=driver."externalId" AND p.vehicle_id=vehicle."externalId" ORDER BY p.recorded_at DESC,p.received_at DESC LIMIT 1) position ON true
 JOIN LATERAL (SELECT p.* FROM driver_positions p WHERE p.driver_id=driver."externalId" AND p.vehicle_id=vehicle."externalId" AND p.recorded_at<position.recorded_at AND p.recorded_at>=position.recorded_at-interval '120 seconds' ORDER BY p.recorded_at DESC,p.received_at DESC LIMIT 1) previous ON true
 WHERE vehicle.provider='AUTOCAB' AND ${fleetLiveEligibility} AND driver.active AND NOT driver.suspended AND NOT driver.archived
 AND position.recorded_at=vehicle."lastSeenAt" AND position.recorded_at BETWEEN $1::timestamptz-interval '90 seconds' AND $1::timestamptz+interval '5 seconds'
 AND fleet_state.status<>'NotWorking'
 AND NOT EXISTS(SELECT 1 FROM street_manager_message_bans b WHERE b.active AND (b.vehicle_id=vehicle."externalId" OR b.driver_id=driver."externalId" OR b.callsign=upper(btrim(driver.callsign))))`,[new Date(now)])).rows;
 const pilotEligible=tracks.some(t=>t.driver_id===tomtomDriver62.driverId&&t.driver_callsign?.trim().toUpperCase()===tomtomDriver62.callsign);
 const tomtom=await driver62TomtomFeed.read(pilotEligible,now,options.refreshTomtom===true);
 const events=combineAlertEvents(streetEvents,tomtom.events).map(e=>({...e,sourceId:('sourceId' in e?String(e.sourceId):e.key)}));
 const candidates:ClosureCandidate[]=[];
 for(const track of tracks){
  const current:DriverFix={driverId:track.driver_id,vehicleId:track.vehicle_id,latitude:Number(track.latitude),longitude:Number(track.longitude),at:new Date(track.recorded_at).getTime()};
  const previous:DriverFix={...current,latitude:Number(track.previous_latitude),longitude:Number(track.previous_longitude),at:new Date(track.previous_at).getTime()};
  const byStreet=new Map<string,ClosureCandidate>();
  for(const closure of events){if(closure.source==='tomtom'&&(track.driver_id!==tomtomDriver62.driverId||track.driver_callsign?.trim().toUpperCase()!==tomtomDriver62.callsign))continue;const candidate=approachingClosure(current,previous,closure,now);if(candidate&&(!byStreet.has(candidate.closureKey)||byStreet.get(candidate.closureKey)!.distanceMetres>candidate.distanceMetres))byStreet.set(candidate.closureKey,candidate)}
  candidates.push(...byStreet.values());
 }
 return {checkedAt:new Date(now).toISOString(),activeClosures:events.filter(e=>e.kind==='closure').length,activeRoadworks:events.filter(e=>e.kind==='roadworks').length,activeRestrictions:events.filter(e=>e.kind==='restriction').length,activeIncidents:events.filter(e=>e.kind==='incident').length,activeCongestion:events.filter(e=>e.kind==='congestion').length,tomtom:tomtom.status,activeEvents:events.length,trackedDrivers:tracks.length,closures:events.filter(e=>e.kind==='closure'),events,candidates:candidates.sort((a,b)=>trafficEventPriority(a.kind)-trafficEventPriority(b.kind)||a.distanceMetres-b.distanceMetres)};
}
export {alertPolicy};
