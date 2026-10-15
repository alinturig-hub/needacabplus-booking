export type FleetResource='drivers'|'vehicles';

type RawRecord=Record<string,unknown>;
function payload(value:unknown):RawRecord{return value!==null&&typeof value==='object'&&!Array.isArray(value)?value as RawRecord:{}}
function string(value:unknown):string|null{return typeof value==='string'&&value.trim()?value.trim():null}
function companyName(value:unknown,companyId:number|null):string|null{const raw=payload(value);return string(raw.companyName)||string(raw.company)|| (companyId===null?null:String(companyId))}
function capabilities(value:unknown):unknown[]{return Array.isArray(value)?value:[]}

export async function fleetList(resource:FleetResource,request:Request){
 const {prisma}=await import('@/lib/prisma');
 const url=new URL(request.url),pageSize=Math.min(100,Math.max(10,Number(url.searchParams.get('pageSize'))||20)),requestedPage=Math.max(1,Number(url.searchParams.get('page'))||1),search=(url.searchParams.get('search')||'').trim(),status=(url.searchParams.get('status')||'All').trim(),company=(url.searchParams.get('company')||'All').trim();
 const companyId=company==='All'?undefined:Number(company);
 if(companyId!==undefined&&!Number.isInteger(companyId))return {items:[],total:0,page:1,pageSize,companies:[],summary:{total:0,active:0,suspended:0,lastSynced:null}};
 if(resource==='drivers'){
  const base={provider:'AUTOCAB',...(companyId!==undefined?{companyId}:{})};
  const where={...base,...(status==='Active'?{active:true,suspended:false}:status==='Suspended'?{suspended:true}:{}),...(search?{OR:[{externalId:{contains:search,mode:'insensitive' as const}},{callsign:{contains:search,mode:'insensitive' as const}},{fullName:{contains:search,mode:'insensitive' as const}},{mobile:{contains:search,mode:'insensitive' as const}},{email:{contains:search,mode:'insensitive' as const}}]}:{})};
  const [total,summaryTotal,active,suspended,last,companyRows]=await Promise.all([
   prisma.driver.count({where}),prisma.driver.count({where:{provider:'AUTOCAB'}}),prisma.driver.count({where:{provider:'AUTOCAB',active:true,suspended:false}}),prisma.driver.count({where:{provider:'AUTOCAB',suspended:true}}),
   prisma.driver.findFirst({where:{provider:'AUTOCAB',lastApiSyncAt:{not:null}},orderBy:{lastApiSyncAt:'desc'},select:{lastApiSyncAt:true}}),
   prisma.driver.findMany({where:{provider:'AUTOCAB',companyId:{not:null}},distinct:['companyId'],select:{companyId:true}})
  ]);
  const page=Math.min(requestedPage,Math.max(1,Math.ceil(total/pageSize)));
  const rows=await prisma.driver.findMany({where,orderBy:[{suspended:'asc'},{fullName:'asc'},{externalId:'asc'}],skip:(page-1)*pageSize,take:pageSize});
  return {items:rows.map(row=>({external_id:row.externalId,callsign:row.callsign,first_name:row.forename,last_name:row.surname,display_name:row.fullName||[row.forename,row.surname].filter(Boolean).join(' ')||row.externalId,mobile:row.mobile,email:row.email,company:companyName(row.rawPayload,row.companyId),status:row.suspended?'Suspended':row.archived?'Archived':row.active?'Active':'Inactive',suspended:row.suspended,capabilities:capabilities(row.capabilities),raw_payload:row.rawPayload,synced_at:row.lastApiSyncAt?.toISOString()||null})),total,page,pageSize,companies:companyRows.map(row=>String(row.companyId)).sort((a,b)=>Number(a)-Number(b)),summary:{total:summaryTotal,active,suspended,lastSynced:last?.lastApiSyncAt?.toISOString()||null}};
 }
 const base={provider:'AUTOCAB',...(companyId!==undefined?{companyId}:{})};
 const where={...base,...(status==='Active'?{isActive:true,isSuspended:false}:status==='Suspended'?{isSuspended:true}:{}),...(search?{OR:[{externalId:{contains:search,mode:'insensitive' as const}},{callsign:{contains:search,mode:'insensitive' as const}},{registration:{contains:search,mode:'insensitive' as const}},{make:{contains:search,mode:'insensitive' as const}},{model:{contains:search,mode:'insensitive' as const}}]}:{})};
 const [total,summaryTotal,active,suspended,last,companyRows]=await Promise.all([
  prisma.vehicle.count({where}),prisma.vehicle.count({where:{provider:'AUTOCAB'}}),prisma.vehicle.count({where:{provider:'AUTOCAB',isActive:true,isSuspended:false}}),prisma.vehicle.count({where:{provider:'AUTOCAB',isSuspended:true}}),
  prisma.integrationSyncJob.findFirst({where:{provider:'AUTOCAB',entity:'VEHICLES',status:'SUCCESS'},orderBy:{finishedAt:'desc'},select:{finishedAt:true}}),
  prisma.vehicle.findMany({where:{provider:'AUTOCAB',companyId:{not:null}},distinct:['companyId'],select:{companyId:true}})
 ]);
 const page=Math.min(requestedPage,Math.max(1,Math.ceil(total/pageSize)));
 const rows=await prisma.vehicle.findMany({where,orderBy:[{isSuspended:'asc'},{callsign:'asc'},{externalId:'asc'}],skip:(page-1)*pageSize,take:pageSize});
 return {items:rows.map(row=>({external_id:row.externalId,callsign:row.callsign,registration:row.registration,make:row.make,model:row.model,colour:row.colour,passenger_capacity:row.size,vehicle_type:row.vehicleType,plate_number:row.plateNumber,company:companyName(row.rawPayload,row.companyId),status:row.isSuspended?'Suspended':row.isActive?'Active':'Inactive',suspended:row.isSuspended,capabilities:capabilities(row.capabilities),raw_payload:row.rawPayload,synced_at:row.updatedAt.toISOString()})),total,page,pageSize,companies:companyRows.map(row=>String(row.companyId)).sort((a,b)=>Number(a)-Number(b)),summary:{total:summaryTotal,active,suspended,lastSynced:last?.finishedAt?.toISOString()||null}};
}
