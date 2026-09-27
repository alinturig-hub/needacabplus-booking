import {test} from 'node:test';
import assert from 'node:assert/strict';
import {capabilityIds,matchDispatchRequirements} from '../lib/dispatch-capabilities.ts';
const car={driver_id:'62',vehicle_id:'88',driver_capabilities:[46],vehicle_capabilities:[8],passenger_capacity:4};
test('non-empty booking capabilities match the driver and vehicle instead of blocking every job',()=>{
 assert.equal(matchDispatchRequirements([46,8],car,{passengers:'4'}).ok,true);
 assert.equal(matchDispatchRequirements([46,8,99],car,{}).ok,false);
 assert.equal(matchDispatchRequirements([],car,{}).ok,true);
 assert.equal(matchDispatchRequirements(undefined,car,{}).ok,false);
});
test('structured IDs, capacity and explicit requested/forbidden constraints are enforced',()=>{
 assert.deepEqual(capabilityIds([{id:46},'8',8]),['46','8']);
 assert.equal(capabilityIds(['Wheelchair']),null);
 assert.equal(matchDispatchRequirements([],car,{passengers:6}).ok,false);
 assert.equal(matchDispatchRequirements([],car,{driverConstraints:{forbiddenDrivers:[62]}}).ok,false);
 assert.equal(matchDispatchRequirements([],car,{vehicleConstraints:{requestedVehicles:[99]}}).ok,false);
 assert.equal(matchDispatchRequirements([],car,{driverConstraints:{requestedDrivers:[62]},vehicleConstraints:{forbiddenVehicles:[]}}).ok,true);
});
