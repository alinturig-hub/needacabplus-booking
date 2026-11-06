import test from 'node:test';
import assert from 'node:assert/strict';
import {passengerMapPresets} from '../lib/passenger-map-preset';
test('standard map gets clean, distinct light and dark styles',()=>{
 assert.deepEqual(passengerMapPresets('streets-v4','streets-v4'),{light:'basic-v2',dark:'basic-v2-dark'});
 assert.deepEqual(passengerMapPresets('streets-v4','streets-v4-dark'),{light:'basic-v2',dark:'basic-v2-dark'});
});
test('custom administrator styles are preserved',()=>{
 assert.deepEqual(passengerMapPresets('custom-light','custom-dark'),{light:'custom-light',dark:'custom-dark'});
});
