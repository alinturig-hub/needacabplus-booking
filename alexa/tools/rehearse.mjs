import {createHandler} from '../lambda/index.js';
const id='amzn1.ask.skill.synthetic-rehearsal';let attributes={};
const handler=createHandler({env:{ALEXA_SKILL_ID:id},fetcher:async(_,init)=>{const body=JSON.parse(init.body);return Response.json(body.action==='quote'?{phase:'quoted',conversationId:'synthetic-conversation',speech:'This is a test. No taxi will be sent. For an immediate pickup, from Home Synthetic Road to Work Synthetic Road. For one passenger with no luggage. The quoted fare is £12.00, paid in cash to the driver. Shall I simulate this booking?'}:{phase:'preview',speech:'Test complete. No taxi has been booked.'});}});
console.log('OFFLINE REHEARSAL — synthetic addresses and price; no real API calls.');
for(const [words,name] of [['Alexa, open Need A Cab Plus.',null],['Book a taxi from Home to Work.','BookTaxiIntent'],['Yes.','AMAZON.YesIntent']]){
 const event={session:{sessionId:'synthetic-rehearsal-session',application:{applicationId:id},attributes},context:{System:{application:{applicationId:id},user:{accessToken:'synthetic-token'}}},request:{type:name?'IntentRequest':'LaunchRequest',requestId:'synthetic-request-'+Math.random(),timestamp:new Date().toISOString(),locale:'en-GB',...(name?{intent:{name,slots:{Pickup:{value:'Home'},Destination:{value:'Work'}}}}:{})}};
 const result=await handler(event);attributes=result.sessionAttributes;console.log('Customer: '+words);console.log('Alexa: '+result.response.outputSpeech.text);
}
