import test from 'node:test';
import assert from 'node:assert/strict';
import {createHandler,createHttpsFetcher} from '../alexa/lambda/index.js';
const time=Date.parse('2026-11-17T12:00:00Z'),skill='amzn1.ask.skill.synthetic';
function event(name='BookTaxiIntent',attributes={}){return {session:{sessionId:'synthetic-session-123',application:{applicationId:skill},attributes},context:{System:{application:{applicationId:skill},user:{accessToken:'synthetic-token'}}},request:{type:'IntentRequest',requestId:'synthetic-request-123',timestamp:new Date(time).toISOString(),locale:'en-GB',intent:{name,slots:{Pickup:{value:'Home'},Destination:{value:'Work'}}}}};}
const jsonResponse=(data,status=200)=>({status,ok:status>=200&&status<300,json:async()=>data});
const setup=fetcher=>createHandler({env:{ALEXA_SKILL_ID:skill},now:()=>time,fetcher});
test('launch and missing account never request a booking',async()=>{let calls=0;const h=setup(async()=>{calls++});const e=event();e.request.type='LaunchRequest';assert.match((await h(e)).response.outputSpeech.text,/Where would you like/);delete e.context.System.user.accessToken;assert.equal((await h(e)).response.card.type,'LinkAccount');assert.equal(calls,0)});
test('rejects foreign applications, stale and future requests before calling backend',async()=>{const h=setup(async()=>{throw Error('must not fetch')});for(const change of [e=>e.context.System.application.applicationId='other',e=>e.session.application.applicationId='other',e=>e.request.timestamp=new Date(time-150001).toISOString(),e=>e.request.timestamp=new Date(time+150001).toISOString()]){const e=event();change(e);await assert.rejects(h(e))}});
test('quote is read before Yes; session stores only a conversation reference',async()=>{const requests=[];const h=setup(async(url,init)=>{requests.push(JSON.parse(init.body));return jsonResponse({speech:'From Home to Work. £12 cash. Shall I book?',phase:'quoted',conversationId:'synthetic-conversation'})});const r=await h(event());assert.equal(requests[0].action,'quote');assert.deepEqual(r.sessionAttributes,{conversationId:'synthetic-conversation'});assert.equal(r.response.shouldEndSession,false);assert.equal(r.response.outputSpeech.type,'PlainText')});
test('Yes without a quote never creates a booking',async()=>{let calls=0;const r=await setup(async()=>{calls++})(event('AMAZON.YesIntent'));assert.match(r.response.outputSpeech.text,/quote first/);assert.equal(calls,0)});
test('confirmation targets only the quoted conversation and timeouts never say booked',async()=>{let sent;const h=setup(async(_,init)=>{sent=JSON.parse(init.body);throw Error('timeout')});const r=await h(event('AMAZON.YesIntent',{conversationId:'known'}));assert.equal(sent.action,'confirm');assert.equal(sent.conversationId,'known');assert.match(r.response.outputSpeech.text,/check the app/);assert.doesNotMatch(r.response.outputSpeech.text,/taxi is booked/)});
test('No cancels the pending request and a revoked account prompts relinking',async()=>{let action;const h=setup(async(_,init)=>{action=JSON.parse(init.body).action;return jsonResponse({speech:'Stopped.',phase:'ended'})});assert.equal((await h(event('AMAZON.NoIntent',{conversationId:'known'}))).response.shouldEndSession,true);assert.equal(action,'cancel');const r=await setup(async()=>jsonResponse({},401))(event());assert.equal(r.response.card.type,'LinkAccount')});
test('slot synonyms use unique canonical saved-place names; endpoint stays fixed',async()=>{let url,body;const e=event();e.request.intent.slots.Destination.resolutions={resolutionsPerAuthority:[{status:{code:'ER_SUCCESS_MATCH'},values:[{value:{name:'Plymouth Station'}}]}]};await setup(async(u,i)=>{url=String(u);body=JSON.parse(i.body);return jsonResponse({speech:'Quote.',phase:'quoted',conversationId:'known'})})(e);assert.equal(body.destination,'Plymouth Station');assert.equal(url,'https://webapp.needacabplus.app/api/alexa/conversation')});
test('stopping without an outstanding quote never contacts the booking service',async()=>{let calls=0;const r=await setup(async()=>{calls++})(event('AMAZON.StopIntent'));assert.equal(calls,0);assert.equal(r.response.shouldEndSession,true)});

function nativeRequestFixture({status=200,payload='{"speech":"Test quote","phase":"quoted"}',hang=false}={}){
 const calls=[];let destroyed=false;
 const request=(url,options,onResponse)=>{
  const handlers={};const req={on:(name,callback)=>{handlers[name]=callback;return req},destroy:()=>{destroyed=true},end:body=>{calls.push({url:String(url),options,body});if(hang)return;setImmediate(()=>{const events={};const res={statusCode:status,on:(name,callback)=>{events[name]=callback;return res},resume(){},destroy(){destroyed=true}};onResponse(res);if(status<300||status>=400){if(events.data)events.data(Buffer.from(payload));if(events.end)events.end();}})}};return req;
 };
 return {request,calls,get destroyed(){return destroyed}};
}
test('native HTTPS posts JSON without fetch and returns the backend response',async()=>{
 const fixture=nativeRequestFixture(),fetcher=createHttpsFetcher(fixture.request);
 const r=await fetcher('https://webapp.needacabplus.app/api/alexa/conversation',{method:'POST',headers:{Authorization:'Bearer synthetic'},body:'{"action":"quote"}'});
 assert.equal(r.ok,true);assert.equal((await r.json()).speech,'Test quote');assert.equal(fixture.calls.length,1);assert.equal(fixture.calls[0].options.headers['Content-Length'],18);assert.equal(fixture.calls[0].options.headers.Authorization,'Bearer synthetic');
});
test('native transport refuses HTTP and redirects without forwarding the bearer token',async()=>{
 const fixture=nativeRequestFixture({status:302}),fetcher=createHttpsFetcher(fixture.request);
 await assert.rejects(fetcher('http://webapp.needacabplus.app',{method:'POST'}),/HTTPS/);assert.equal(fixture.calls.length,0);
 await assert.rejects(fetcher('https://webapp.needacabplus.app/api/alexa/conversation',{method:'POST',headers:{Authorization:'Bearer synthetic'}}),/redirects/);assert.equal(fixture.calls.length,1);assert.equal(fixture.destroyed,true);
});
test('native HTTPS bounds response size and wall-clock timeout without retry',async()=>{
 const big=nativeRequestFixture({payload:'x'.repeat(65537)});await assert.rejects(createHttpsFetcher(big.request)('https://webapp.needacabplus.app',{method:'POST'}),/too large/);assert.equal(big.calls.length,1);
 const slow=nativeRequestFixture({hang:true});await assert.rejects(createHttpsFetcher(slow.request,10)('https://webapp.needacabplus.app',{method:'POST'}),/timed out/);assert.equal(slow.calls.length,1);assert.equal(slow.destroyed,true);
});
