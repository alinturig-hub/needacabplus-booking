import test from 'node:test';
import assert from 'node:assert/strict';
import {configuredMapStyle,fallbackMapStyle,selectedMapStyle} from '../lib/browser-map-style';
test('dark fallback starts dark before tiles load and light remains selectable',()=>{
 const dark=fallbackMapStyle('dark').layers[0],light=fallbackMapStyle('light').layers[0];
 assert.equal(dark.type,'raster');assert.equal(light.type,'raster');
 if(dark.type==='raster'&&light.type==='raster'){assert.equal(dark.paint?.['raster-brightness-max'],.42);assert.equal(light.paint?.['raster-brightness-max'],1);}
});
test('configured dark style works without a light style; failures retain dark fallback',async()=>{
 const original=globalThis.fetch;
 try{globalThis.fetch=async()=>Response.json({provider:'maptiler',darkStyleUrl:'https://example.invalid/dark.json'});assert.equal(await configuredMapStyle('dark'),'https://example.invalid/dark.json');
 globalThis.fetch=async()=>new Response('',{status:503});assert.deepEqual(await configuredMapStyle('dark'),fallbackMapStyle('dark'));}finally{globalThis.fetch=original;}
});

test('identical day and night URLs use dark fallback rather than the day style',()=>{
 const styles={lightStyleUrl:'https://example.invalid/day.json',darkStyleUrl:'https://example.invalid/day.json'};
 assert.equal(selectedMapStyle('dark',styles),null);
 assert.equal(selectedMapStyle('light',styles),styles.lightStyleUrl);
 assert.equal(selectedMapStyle('dark',{...styles,darkStyleUrl:'https://example.invalid/night.json'}),'https://example.invalid/night.json');
});
