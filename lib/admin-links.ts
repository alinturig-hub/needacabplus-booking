export function taxiCrmAppUrl(){
 try{
  const url=new URL(process.env.NEXT_PUBLIC_TAXICRM_APP_URL||'https://taxicrm.plymhub.ai');
  return url.protocol==='https:'||url.protocol==='http:'?url.toString():null;
 }catch{return null}
}
