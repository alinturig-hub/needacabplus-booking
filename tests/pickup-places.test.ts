import {test} from 'node:test';
import assert from 'node:assert/strict';
import {pickupPlaces,pickupWithPlace} from '../lib/pickup-places';

test('nearby pickup choices are useful, nearby, sorted and deduplicated',()=>{
 const places=pickupPlaces([{name:'-',distanceMetres:35},{name:'Co-op Food',distanceMetres:19},{name:'co-op food',distanceMetres:22},{name:'Stoke cafe',distanceMetres:31},{name:'Far away',distanceMetres:301},{name:'Unknown',distanceMetres:null},{name:'Broken',distanceMetres:NaN}]);
 assert.deepEqual(places,[{name:'Co-op Food',distanceMetres:19},{name:'Stoke cafe',distanceMetres:31}]);
 assert.equal(pickupPlaces(Array.from({length:9},(_,i)=>({name:`Place ${i}`,distanceMetres:i}))).length,5);
 assert.deepEqual(pickupPlaces(null),[]);
});

test('choosing a venue preserves the GPS coordinate, booking zone and source address',()=>{
 const choice={address:'44 Devonport Road, Plymouth PL2 1BH',fullAddress:{text:'44 Devonport Road, Plymouth PL2 1BH',coordinate:{latitude:50.38,longitude:-4.16},zone:17},placeID:null,customAddressID:'gps'};
 const selected=pickupWithPlace(choice,'Co-op Food');
 assert.equal(selected.address,'Co-op Food, 44 Devonport Road, Plymouth PL2 1BH');
 assert.equal(selected.fullAddress.text,selected.address);
 assert.deepEqual(selected.fullAddress.coordinate,choice.fullAddress.coordinate);
 assert.equal(selected.fullAddress.zone,17);
 assert.equal(choice.fullAddress.text,'44 Devonport Road, Plymouth PL2 1BH');
 assert.equal(pickupWithPlace(choice,undefined),choice);
 assert.equal(pickupWithPlace(selected,'Co-op Food').address,selected.address);
});
