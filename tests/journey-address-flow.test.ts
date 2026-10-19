import {test} from 'node:test';
import assert from 'node:assert/strict';
import {nextJourneyStop} from '../lib/journey-address-flow';
const pickup={address:'42 Devonport Road, Plymouth'},destination={address:'ALDI, Derriford Retail Park, Plymouth'};
test('recent destination requests pickup first, then confirmed GPS goes directly to rides',()=>{
 assert.equal(nextJourneyStop({destination},0),'pickup');
 assert.equal(nextJourneyStop({pickup,destination},0),null);
});
test('manual pickup keeps the selected recent destination and completes the same route',()=>{
 const manual={address:'Plymouth Railway Station, North Road'};
 assert.equal(nextJourneyStop({pickup:manual,destination},0),null);
 assert.equal(nextJourneyStop({pickup},0),'destination');
});
test('missing via stops and repeated addresses never open ride selection',()=>{
 assert.equal(nextJourneyStop({pickup,destination},1),'via-0');
 assert.equal(nextJourneyStop({pickup,destination:{address:' 42 DEVONPORT ROAD, PLYMOUTH '}},0),'destination');
 assert.equal(nextJourneyStop({pickup,'via-0':pickup,destination},1),'via-0');
 assert.equal(nextJourneyStop({pickup,'via-0':{address:'Plymouth Station'},destination},1),null);
});
