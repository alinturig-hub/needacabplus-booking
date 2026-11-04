import test from 'node:test';
import assert from 'node:assert/strict';
import {NextRequest} from 'next/server';
import {proxy} from '../proxy';
import {ebookerPublicLink} from '../lib/ebooker-links';
const request=(url:string)=>new NextRequest(url,{headers:{host:new URL(url).host}});

test('eBooker domain root serves the default eBooker and preserves campaign query parameters',async()=>{
 const response=await proxy(request('https://eb.needacabplus.app/?utm_source=hotel&utm_campaign=summer'));
 assert.equal(response.headers.get('x-middleware-rewrite'),'https://eb.needacabplus.app/ebooker/needacabplus?utm_source=hotel&utm_campaign=summer');
 assert.equal(response.headers.get('location'),null);
});
test('existing public links, customer authentication and API routes remain on their original host',async()=>{
 for(const url of ['https://eb.needacabplus.app/ebooker/hotel','https://webapp.needacabplus.app/ebooker/needacabplus','https://eb.needacabplus.app/customer-login?returnTo=%2Febooker%2Fhotel','https://eb.needacabplus.app/api/customer/me','https://webapp.needacabplus.app/']){
  const response=await proxy(request(url));assert.equal(response.headers.get('location'),null,url);assert.equal(response.headers.get('x-middleware-rewrite'),null,url);
 }
});
test('eBooker admin access uses the existing admin domain',async()=>{
 const response=await proxy(request('https://eb.needacabplus.app/admin/configuration/ebookers'));
 assert.equal(response.headers.get('location'),'https://admin.needacabplus.app/admin/configuration/ebookers');
});
test('copied public links use the dedicated domain while local development stays local',()=>{
 assert.equal(ebookerPublicLink('hotel-station'),'https://eb.needacabplus.app/ebooker/hotel-station');
 assert.equal(ebookerPublicLink('hotel-station','http://localhost:3000'),'http://localhost:3000/ebooker/hotel-station');
});
