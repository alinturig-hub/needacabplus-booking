import {createRequire} from 'node:module';
import {mkdtemp,writeFile,readFile,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createServer} from 'node:http';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{build}=require('esbuild'),{chromium}=require('playwright');
const root=resolve(new URL('..',import.meta.url).pathname),temp=await mkdtemp(join(tmpdir(),'ebooker-browser-'));
const artifacts=process.env.EBOOKER_ARTIFACT_DIR||join(temp,'screenshots');await mkdir(artifacts,{recursive:true});
const station={text:'Plymouth Railway Station, North Road East, Plymouth',coordinate:{latitude:50.3778,longitude:-4.1436},zoneId:1};
const hospital={text:'Derriford Hospital, Derriford Road, Plymouth',coordinate:{latitude:50.4166,longitude:-4.1139},zoneId:2};
const config={id:'11111111-1111-4111-8111-111111111111',revision:1,name:'Need A Cab Plus',slug:'station-partner',enabled:true,logoUrl:'',supportPhone:'+441234567890',pickupMode:'fixed',pickup:station,maxPassengers:4};
await writeFile(join(temp,'entry.tsx'),`import React from 'react';import {createRoot} from 'react-dom/client';import Ebooker from ${JSON.stringify(join(root,'app/ebooker/[slug]/workspace.tsx'))};import Admin from ${JSON.stringify(join(root,'app/admin/configuration/ebookers/settings.tsx'))};import ${JSON.stringify(join(root,'app/ebooker/[slug]/ebooker.css'))};import ${JSON.stringify(join(root,'app/admin/configuration/ebookers/settings.css'))};import ${JSON.stringify(join(root,'node_modules/maplibre-gl/dist/maplibre-gl.css'))};const q=new URLSearchParams(location.search),config=${JSON.stringify(config)};if(q.has('preset'))config.pickupMode='preset';createRoot(document.getElementById('root')!).render(q.has('admin')?<Admin/>:<Ebooker config={config} preview={false}/>);`);
await writeFile(join(temp,'next-link.tsx'),`import React from 'react';export default function Link(props){return <a {...props}/>}`);
await build({alias:{'next/link':join(temp,'next-link.tsx')},entryPoints:[join(temp,'entry.tsx')],bundle:true,platform:'browser',format:'esm',outdir:temp,tsconfig:join(root,'tsconfig.json'),nodePaths:[join(root,'node_modules')],jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'}});
await writeFile(join(temp,'index.html'),'<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/entry.css"><style>body{margin:0;font-family:Arial;background:#151b20}#watermark{position:fixed;bottom:3px;left:5px;z-index:9999;font:9px Arial;color:#657050;background:#fffef2cc;padding:3px}</style></head><body><div id="root"></div><div id="watermark">Design preview · synthetic data · no real bookings</div><script type="module" src="/entry.js"></script></body></html>');
const server=createServer(async(req,res)=>{try{const path=req.url.split('?')[0];const file=path==='/entry.js'?'entry.js':path==='/entry.css'?'entry.css':'index.html';res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(await readFile(join(temp,file)))}catch{res.statusCode=500;res.end()}});
await new Promise(done=>server.listen(0,'127.0.0.1',done));const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const errors=[],requests=[];let items=[{...config,requests:0}];
try{
 const page=await browser.newPage({viewport:{width:390,height:844}});page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{window.EventSource=class{addEventListener(){}close(){}}});
 await page.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url()),path=url.pathname;
  const json=data=>route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
  if(url.hostname!=='127.0.0.1'){
   if(url.hostname==='router.project-osrm.org')return json({code:'Ok',routes:[{distance:5200,duration:540,geometry:{coordinates:[[-4.1436,50.3778],[-4.14,50.39],[-4.1139,50.4166]]}}]});
   return route.abort();
  }
  if(!path.startsWith('/api/'))return route.continue();
  if(path==='/api/customer/me'){if(new URL(req.headers().referer||origin).searchParams.has('member'))return json({customer:{fullName:'Existing Member',phone:'+447700900999'}});return route.fulfill({status:401,contentType:'application/json',body:'{}'})}
  if(path==='/api/quotes')return json({enabled:true,paymentMethods:['cash'],minPrebookMinutes:15});
  if(path==='/api/address/current')return json({item:{address:hospital.text,fullAddress:hospital},match:{kind:'place',name:'Derriford Hospital'}});
  if(path==='/api/address/search'){const stop=(url.searchParams.get('q')||'').toLowerCase().includes('derriford')?hospital:station;return json({items:[{address:stop.text,fullAddress:stop,placeID:null}]})}
  if(path.endsWith('/session'))return json({ok:true});
  if(path.endsWith('/quote')){const body=req.postDataJSON();requests.push({path,body});const j=body.journey;return json({quote:{id:'22222222-2222-4222-8222-222222222222',vehicle:'saloon',service:j.service,scheduledAt:j.scheduledAt,pickup:j.pickup.text,destination:j.destination.text,vias:j.vias.map(v=>v.text),totalPence:1690,expiresAt:new Date(Date.now()+60000).toISOString(),currency:'GBP',paymentMethod:'cash',liveBooking:true},token:'synthetic-quote-token'})}
  if(path==='/api/bookings'){requests.push({path,body:req.postDataJSON()});return json({id:'22222222-2222-4222-8222-222222222222',status:'Booked',live:true,pending:false,externalBookingId:'12345678'})}
  if(path.endsWith('/track'))return json({id:'22222222-2222-4222-8222-222222222222',status:'Booked',pending:false,externalBookingId:'12345678',tracking:{status:'Completed'}});
  if(path==='/api/map/config')return json({provider:'openstreetmap'});
  if(path==='/api/map/vehicles')return json([]);
  if(path==='/api/admin/ebookers'&&req.method()==='GET')return json({items});
  if(path==='/api/admin/ebookers'&&req.method()==='POST'){const input=req.postDataJSON();requests.push({path,body:input});const item={...input,id:'33333333-3333-4333-8333-333333333333',revision:1,requests:0};items=[...items,item];return json({item})}
  return json({});
 });
 await page.goto(origin);await page.getByRole('heading',{name:'Where to?'}).waitFor();await page.screenshot({path:join(artifacts,'ebooker-home.png'),fullPage:true});
 await page.getByRole('button',{name:'Enter destination'}).click();assert.equal(await page.getByLabel('Pickup',{exact:true}).isEditable(),false);
 await page.getByLabel('Destination',{exact:true}).fill('Derriford');await page.getByRole('button',{name:hospital.text,exact:true}).click();
 await page.getByLabel('Full name',{exact:true}).fill('Synthetic Passenger');await page.getByLabel('Phone number',{exact:true}).fill('07700900123');
 await page.getByRole('button',{name:'More passengers'}).click();await page.getByRole('button',{name:'More passengers'}).click();
 await page.screenshot({path:join(artifacts,'ebooker-journey.png'),fullPage:true});
 await page.getByRole('button',{name:'Schedule',exact:true}).click();await page.getByRole('dialog').waitFor();assert.deepEqual(await page.getByLabel('Pickup minute',{exact:true}).locator('option').allTextContents(),['00','05','10','15','20','25','30','35','40','45','50','55']);await page.screenshot({path:join(artifacts,'ebooker-schedule.png'),fullPage:true});await page.getByRole('button',{name:'Cancel',exact:true}).click();
 await page.getByRole('button',{name:'Proceed to booking'}).click();await page.getByRole('heading',{name:'Your journey'}).waitFor();assert.equal(await page.getByRole('button',{name:'Book now',exact:true}).isEnabled(),false);await page.screenshot({path:join(artifacts,'ebooker-review.png'),fullPage:true});
 await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Book now',exact:true}).click();await page.getByRole('heading',{name:'Booked',exact:true}).waitFor();
 const booking=requests.find(r=>r.path==='/api/bookings').body;assert.equal(booking.phone,'+447700900123');assert.equal(booking.passengers,3);assert.equal(booking.acknowledged,true);
 assert.equal(requests.find(r=>r.path.endsWith('/quote')).body.journey.pickup.text,station.text);
 await page.getByRole('button',{name:'Back to home'}).click();await page.getByRole('button',{name:'Manage booking'}).click();await page.getByLabel('Booking reference',{exact:true}).fill('12345678');await page.getByRole('button',{name:'Find booking'}).click();await page.getByRole('heading',{name:'Completed',exact:true}).waitFor();
 await page.goto(origin+'?preset=1');await page.getByRole('button',{name:'Enter destination'}).click();assert.equal(await page.getByLabel('Pickup',{exact:true}).isEditable(),true);
 await page.getByRole('button',{name:'Set location on map',exact:true}).first().click();await page.getByRole('dialog').waitFor();assert.equal(await page.getByRole('button',{name:'Use this location'}).isEnabled(),false);await page.getByRole('button',{name:'Cancel',exact:true}).click();assert.equal(await page.getByLabel('Pickup',{exact:true}).inputValue(),station.text);await page.context().grantPermissions(['geolocation']);await page.context().setGeolocation({latitude:50.4166,longitude:-4.1139});await page.getByRole('button',{name:'Set location on map',exact:true}).first().click();await page.getByRole('button',{name:'Use current location',exact:true}).click();await page.getByText('Nearby place: Derriford Hospital.',{exact:false}).waitFor();await page.getByRole('button',{name:'Use this location',exact:true}).click();assert.equal(await page.getByLabel('Pickup',{exact:true}).inputValue(),hospital.text);
 await page.getByRole('button',{name:'Schedule',exact:true}).click();await page.getByRole('button',{name:'OK',exact:true}).click();await page.getByText(/· UK time/).waitFor();
 await page.setViewportSize({width:360,height:800});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true,'mobile layout should not scroll horizontally');
 await page.setViewportSize({width:1280,height:900});await page.goto(origin+'?member=1');await page.getByText('Signed in · Existing Member').waitFor();await page.getByRole('button',{name:'Enter destination'}).click();assert.equal(await page.getByLabel('Full name',{exact:true}).inputValue(),'Existing Member');assert.equal(await page.getByLabel('Phone number',{exact:true}).inputValue(),'+447700900999');assert.equal(await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight),true,'desktop journey fits the viewport');await page.screenshot({path:join(artifacts,'ebooker-desktop.png'),fullPage:true});await page.goto(origin+'?admin=1');await page.getByRole('heading',{name:'eBookers',exact:true}).waitFor();await page.getByRole('button',{name:'New eBooker'}).click();
 await page.getByLabel('Name',{exact:true}).fill('Synthetic Hotel');await page.getByLabel('Support telephone',{exact:true}).fill('+441234567890');await page.getByLabel('Pickup behaviour').selectOption('fixed');await page.getByLabel('Search pickup address',{exact:true}).fill('Station');await page.getByRole('button',{name:station.text,exact:true}).click();await page.getByRole('button',{name:'Save eBooker',exact:true}).click();await page.getByRole('status').filter({hasText:'Draft saved'}).waitFor();
 assert.equal(await page.getByLabel('Public link name').isEditable(),false);const saved=requests.find(r=>r.path==='/api/admin/ebookers').body;assert.equal(saved.enabled,false);assert.equal(saved.pickupMode,'fixed');assert.equal(saved.pickup.zoneId,1);
 await page.screenshot({path:join(artifacts,'ebooker-admin.png'),fullPage:true});
 assert.deepEqual(errors,[]);console.log('PASS mobile journey, fixed/preset pickup, schedule, cash confirmation, session tracking and admin creation');console.log('Screenshots: '+artifacts);
}finally{await browser.close();await new Promise(done=>server.close(done));await rm(temp,{recursive:true,force:true})}
