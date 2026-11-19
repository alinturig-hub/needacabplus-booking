// AWS Lambda only: invocation permission must be restricted to this skill ID.
// Native HTTPS keeps this handler compatible with Alexa-hosted Node.js 16.
// eslint-disable-next-line @typescript-eslint/no-require-imports -- AWS Lambda CommonJS runtime.
const https = require('https');
const DEFAULT_SKILL_ID = 'amzn1.ask.skill.98ba95c6-7892-4739-8faf-6a26e41cbccd';
function createHttpsFetcher(requester = https.request, timeoutMs = 6500) {
  return function fetchBackend(url, options) {
    return new Promise(function(resolve, reject) {
      var req, timer, settled = false;
      function fail(error) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (req) req.destroy();
        reject(error);
      }
      try {
        var target = new URL(url);
        if (target.protocol !== 'https:' || target.username || target.password) throw new Error('Invalid HTTPS target.');
        var body = options.body || '';
        var headers = Object.assign({}, options.headers, {'Content-Length': Buffer.byteLength(body)});
        req = requester(target, {method: options.method, headers: headers}, function(res) {
          var status = res.statusCode;
          if (status >= 300 && status < 400) { res.resume(); fail(new Error('Backend redirects are not followed.')); return; }
          var chunks = [], bytes = 0;
          res.on('error', fail);
          res.on('aborted', function() { fail(new Error('Backend response aborted.')); });
          res.on('data', function(chunk) {
            bytes += chunk.length;
            if (bytes > 65536) { res.destroy(); fail(new Error('Backend response too large.')); return; }
            chunks.push(chunk);
          });
          res.on('end', function() {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            var text = Buffer.concat(chunks).toString('utf8');
            resolve({status: status, ok: status >= 200 && status < 300, json: async function() { return JSON.parse(text); }});
          });
        });
        req.on('error', fail);
        timer = setTimeout(function() { fail(new Error('Backend request timed out.')); }, timeoutMs);
        req.end(body);
      } catch (error) { fail(error); }
    });
  };
}
const response=(text,attributes={},end=false,link=false)=>({version:'1.0',sessionAttributes:attributes,response:{outputSpeech:{type:'PlainText',text},shouldEndSession:end,...(!end?{reprompt:{outputSpeech:{type:'PlainText',text:attributes.conversationId?'Say yes to confirm, or no to stop.':'Say a saved destination, such as Work, or say stop.'}}}:{}),...(link?{card:{type:'LinkAccount'}}:{})}});
function slot(intent,name){const s=intent?.slots?.[name];const matches=[...new Set((s?.resolutions?.resolutionsPerAuthority||[]).filter(r=>r.status?.code==='ER_SUCCESS_MATCH').flatMap(r=>(r.values||[]).map(v=>v.value?.name).filter(Boolean)))];return matches.length===1?matches[0]:s?.value;}
function createHandler({env=process.env,fetcher=createHttpsFetcher(),now=Date.now}={}){
 return async function handler(event){
  const expected=env.ALEXA_SKILL_ID,system=event?.context?.System,request=event?.request,attributes=event?.session?.attributes||{};
  if(!expected||system?.application?.applicationId!==expected||event?.session?.application?.applicationId!==expected)throw Error('Invalid skill application.');
  if(!request?.requestId||!Number.isFinite(Date.parse(request.timestamp))||Math.abs(now()-Date.parse(request.timestamp))>150000)throw Error('Expired or invalid Alexa request.');
  if(request.locale!=='en-GB')return response('This private skill currently supports English United Kingdom.',{},true);
  if(request.type==='SessionEndedRequest')return {version:'1.0',response:{shouldEndSession:true}};
  const accessToken=system.user?.accessToken;if(!accessToken)return response('Link your Need A Cab Plus account in the Alexa app to continue.',{},true,true);
  const name=request.intent?.name;
  if(request.type==='LaunchRequest')return response('Welcome to Need A Cab Plus. Where would you like to go from Home? Say a saved place, such as Work.');
  if(request.type!=='IntentRequest')return response('Please say open Need A Cab Plus.',{},true);
  if(name==='AMAZON.HelpIntent'||name==='AMAZON.FallbackIntent')return response('Say book a taxi from Home to Work. I use saved addresses and read the fare before asking you to confirm.',attributes);
  const cancel=['AMAZON.StopIntent','AMAZON.CancelIntent','AMAZON.NoIntent'].includes(name);
  if(cancel&&!attributes.conversationId)return response('I stopped this request.',{},true);
  const confirm=name==='AMAZON.YesIntent';
  if(confirm&&!attributes.conversationId)return response('Please ask for a taxi quote first. Where would you like to go?');
  if(!cancel&&!confirm&&name!=='BookTaxiIntent')return response('Say a saved destination, such as Work.');
  const destination=slot(request.intent,'Destination'),pickup=slot(request.intent,'Pickup')||'Home';
  if(!cancel&&!confirm&&!destination)return response('Where would you like to go? Say a saved destination, such as Work.');
  try{
   const root=new URL(env.BOOKING_BACKEND_ORIGIN||'https://webapp.needacabplus.app');
   if(root.protocol!=='https:'||root.origin!=='https://webapp.needacabplus.app')throw Error('Invalid backend.');
   const result=await fetcher(new URL('/api/alexa/conversation',root),{method:'POST',redirect:'error',headers:{'Content-Type':'application/json',Authorization:'Bearer '+accessToken},body:JSON.stringify({action:cancel?'cancel':confirm?'confirm':'quote',requestId:request.requestId,sessionId:event.session.sessionId,...(cancel||confirm?{conversationId:attributes.conversationId}:{pickup,destination})})});
   if(result.status===401)return response('Please relink your Need A Cab Plus account in the Alexa app.',{},true,true);
   if(!result.ok)throw Error('Booking backend unavailable.');const data=await result.json();
   if(typeof data.speech!=='string'||data.speech.length>6000)throw Error('Invalid speech.');
   return response(data.speech,data.phase==='quoted'&&data.conversationId?{conversationId:data.conversationId}:{},!['quoted','ask_destination'].includes(data.phase));
  }catch{return response(confirm||cancel?'I could not confirm the outcome. Please check the app before requesting another taxi.':'I could not get a fare right now. Please try the Need A Cab Plus app.',{},true);}
 };
}
exports.createHandler=createHandler;
exports.createHttpsFetcher=createHttpsFetcher;
exports.handler=createHandler({env:Object.assign({},process.env,{ALEXA_SKILL_ID:process.env.ALEXA_SKILL_ID||DEFAULT_SKILL_ID})});
