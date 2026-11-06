import test from 'node:test';
import assert from 'node:assert/strict';
import {stationSearchQuery,knownPlaceAddress} from '../lib/station-search';
test('station names include common railway wording and plural typo',()=>{
 for(const q of ['Plymouth Train Station','Plymouth trains station','Plymouth railway station','Plymouth rail station'])assert.equal(stationSearchQuery(q),'Plymouth train station');
 assert.equal(stationSearchQuery('Station Road'),null);assert.equal(stationSearchQuery('67 Salcombe Road'),null);
});
test('only complete known places retain their canonical booking address',()=>{
 const value={source:'WellKnown',isCustom:true,id:'synthetic',coordinate:{latitude:50.377,longitude:-4.143}};
 assert.equal(knownPlaceAddress(value),true);assert.equal(knownPlaceAddress({...value,coordinate:{latitude:999,longitude:-4}}),false);assert.equal(knownPlaceAddress({...value,source:'Other'}),false);assert.equal(knownPlaceAddress({...value,coordinate:null}),false);
});
