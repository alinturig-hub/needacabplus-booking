export const integrations=[
 {id:'autocab',name:'Autocab',description:'External booking and dispatch integration. Configure outgoing API access and incoming event receivers independently.',sections:[
  {id:'api',name:'Connection & API',description:'Authentication, saved connections and a grouped API endpoint catalog.'},
  {id:'webhooks',name:'Webhook links & receiver',description:'Generate event links in this platform, copy them into Autocab and inspect received events.'},
 ]},
 {id:'taxicrm',name:'TaxiCRM',description:'Independent integration for basic operational information and AI capabilities.',sections:[
  {id:'data',name:'Data access',description:'Inspect the existing data connection, access permissions and source tables.'},
  {id:'ai',name:'AI workspace',description:'Open the existing assistant workspace. TaxiCRM AI provider and permissions will be configured separately.'},
 ]},
] as const;
