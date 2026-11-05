# Isolated loopback production-build runner. No provider credentials are inherited.
import os,json,pathlib,sys,re,urllib.parse
c=json.loads(pathlib.Path(os.environ.get('CONTROLLED_QA_CONFIG','/tmp/controlled-dispatch-qa/config.private.json')).read_text());role=sys.argv[1]
if role not in ['nac','crm']:raise SystemExit('Select nac or crm')
u=urllib.parse.urlparse(c['url'])
if u.hostname!='127.0.0.1' or u.port!=55439 or u.username!='whatsapp_qa' or not re.fullmatch(r'/notifications_controlled_qa_[a-z0-9]+',u.path):raise SystemExit('Local QA database required')
nac_root=pathlib.Path(__file__).resolve().parents[3];crm_root=os.environ.get('TAXICRM_CHECKOUT')
if not crm_root:raise SystemExit('TAXICRM_CHECKOUT required')
env={**os.environ,'NODE_ENV':'production','NEXT_TELEMETRY_DISABLED':'1','DATABASE_URL':c['url'],'TAXICRM_SHARED_DATABASE_URL':c['url'],'TAXICRM_DATABASE_URL':c['url'],'BOOKING_ATTEMPTS_DATABASE_URL':c['url'],'APP_ORIGIN':c['nacOrigin'] if role=='nac' else c['crmOrigin'],'CONTROLLED_BC_MODE':'SIMULATED','CONTROLLED_BC_BOOKING_ID':'SYNTHETIC-BC-53fd75f0-eb4d-4042-8ee6-92ebcc845f9d','CONTROLLED_BC_RECIPIENT':c['recipient'],'CONTROLLED_BC_EXPIRES_AT':c['deadline'],'CONTROLLED_BC_RULE_ID':'controlled-bc-test','CONTROLLED_BC_RULE_VERSION':'2','CONTROLLED_BC_TEMPLATE_FILE':c['templateFile'],'CONTROLLED_BC_SIMULATOR_FILE':c['simulatorFile'],'WHATSAPP_WORKSPACE_ID':c['workspace'],'WHATSAPP_SHARED_ENABLED':'true','META_WHATSAPP_SENDING_ENABLED':'false','WHATSAPP_JOURNEY_SENDING_ENABLED':'false','META_WHATSAPP_TEST_SEND_ENABLED':'false','META_WHATSAPP_APP_ID':'99999999997','META_WHATSAPP_WABA_ID':'99999999999','META_WHATSAPP_PHONE_NUMBER_ID':'99999999998','META_WHATSAPP_GRAPH_VERSION':'v25.0','WHATSAPP_WABA_ID':'99999999999','WHATSAPP_PHONE_NUMBER_ID':'99999999998','WHATSAPP_NAC_ORIGIN':c['nacOrigin'],'WHATSAPP_GATEWAY_ORIGIN':c['crmOrigin'],'WHATSAPP_NAC_KEY_ID':c['nacKey'],'WHATSAPP_NAC_SECRET':c['nacSecret'],'WHATSAPP_CRM_KEY_ID':c['crmKey'],'WHATSAPP_CRM_SECRET':c['crmSecret'],'META_WHATSAPP_APP_SECRET':c['appSecret'],'META_WHATSAPP_INBOX_ENABLED':'true'}
for k in ['META_WHATSAPP_ACCESS_TOKEN','SMS_API_KEY','AUTOCAB_API_KEY','NOTIFICATIONS_FULL_STAGE','STAGING_NO_SEND']:env.pop(k,None)
if role=='nac':
 os.chdir(nac_root);env['PORT']='5521';env['HOSTNAME']='127.0.0.1';os.execvpe('node',['node','.next/standalone/server.js'],env)
os.chdir(nac_root if role=='nac' else crm_root);os.execvpe('node',['node','node_modules/next/dist/bin/next','start','-H','127.0.0.1','-p','5521' if role=='nac' else '5522'],env)
