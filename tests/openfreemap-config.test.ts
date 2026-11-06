import test from 'node:test';
import assert from 'node:assert/strict';
import {GET} from '../app/api/map/config/route';
import {configuredMapStyle} from '../lib/browser-map-style';
test('public map configuration selects distinct OpenFreeMap styles without credentials',async()=>{
 const result=await GET(),data=await result.json() as {provider:string;lightStyleUrl:string;darkStyleUrl:string};assert.equal(data.provider,'openfreemap');
 const original=globalThis.fetch;try{globalThis.fetch=async()=>Response.json(data);assert.equal(await configuredMapStyle('light'),'https://tiles.openfreemap.org/styles/liberty');assert.equal(await configuredMapStyle('dark'),'https://tiles.openfreemap.org/styles/fiord')}finally{globalThis.fetch=original}
 assert.ok(!JSON.stringify(data).includes('key='));
});
