import test from 'node:test';
import assert from 'node:assert/strict';
import {nearbyVenueLabel} from '../lib/venue-label';
test('nearby venue preserves complete GPS address without claiming the building belongs to it',()=>{
 assert.equal(nearbyVenueLabel('The Navy Pub','33 Synthetic Street, Plymouth, PL1 1AA'),'Near The Navy Pub, 33 Synthetic Street, Plymouth, PL1 1AA');
});
test('venue already present is not repeated',()=>assert.equal(nearbyVenueLabel('The Navy Pub','THE NAVY PUB, Synthetic Street, Plymouth'),'THE NAVY PUB, Synthetic Street, Plymouth'));
