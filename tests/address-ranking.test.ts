import test from 'node:test';
import assert from 'node:assert/strict';
import {rankAddressSuggestions,pickupSearchCity} from '../lib/address-ranking';
test('Plymouth venues matching the name precede street-only matches and out-of-town schools',()=>{
 const items=[{address:'OPEN DOORS LANGUAGE SCHOOL, 28 WOODLAND TERRACE LANE, Plymouth, PL4 8QL'},{address:'WOODLANDS PARK PRIMARY SCHOOL, ABBOT ROAD, IVYBRIDGE, PL21 9FG'},{address:'WOODLANDS SPECIAL SCHOOL, PICKLECOMBE DRIVE, Plymouth, PL6 5ES'},{address:'Woodlands School, Plymouth, UK',placeID:'synthetic'},{address:'Woodlands School, Bristol, UK'}];
 const result=rankAddressSuggestions(items,'Woodland school');assert.equal(result[0],items[3]);assert.equal(result[1],items[2]);assert.equal(result[2],items[0]);assert.equal(items[0].address.startsWith('OPEN DOORS'),true);
});
test('verified pickup town changes the preferred locality; no town falls back to Plymouth',()=>{
 assert.equal(pickupSearchCity({town:'Exeter'}),'Exeter');assert.equal(pickupSearchCity(null),'Plymouth');
 const items=[{address:'Museum, Plymouth, UK'},{address:'Museum, Exeter EX1 1AA, UK'}];assert.equal(rankAddressSuggestions(items,'museum','Exeter')[0],items[1]);
});
test('explicit destination town can precede current pickup city',()=>{
 const items=[{address:'School, Plymouth',fullAddress:{town:'Plymouth'}},{address:'School, Bristol',fullAddress:{town:'Bristol'}}];assert.equal(rankAddressSuggestions(items,'Bristol school','Plymouth')[0],items[1]);
});
