import assert from 'node:assert/strict';
import test from 'node:test';
import {saveDriverEvent} from '../lib/driver-events.ts';

test('vehicle track webhook stores driver and vehicle positions, including unassigned vehicles',async()=>{
 const writes=[];
 const db={query:async(sql,params)=>{writes.push({sql,params});return {rows:[]}}};
 const payload={VehicleTracks:[
  {Driver:{Id:132,Callsign:'132',Forename:'Kevin',Surname:'Johnson'},Vehicle:{Id:81,Callsign:'81',Registration:'PF65XMU'},CurrentLocation:{Latitude:50.375,Longitude:-4.143},VehicleStatus:'BusyMeterOff',BookingId:13203119,Timestamp:'2026-10-13T10:00:00Z'},
  {Vehicle:{Id:219,Callsign:'219'},CurrentLocation:{Latitude:50.37,Longitude:-4.12},VehicleStatus:'Clear',Timestamp:'2026-10-13T10:00:02Z'},
  {Vehicle:{Id:999},CurrentLocation:{Latitude:null,Longitude:-4.1},Timestamp:'2026-10-13T10:00:04Z'},
 ]};
 const result=await saveDriverEvent(db,payload,'Vehicle Tracks Changed');
 assert.equal(result.saved,true);
 assert.equal(result.positions,2);
 const stored=JSON.parse(writes.find(write=>write.sql.includes('INSERT INTO driver_positions')).params[0]);
 assert.deepEqual(stored.map(position=>[position.driver_id,position.vehicle_id,position.latitude,position.longitude]),[
  ['132','81',50.375,-4.143],['vehicle:219','219',50.37,-4.12],
 ]);
});
