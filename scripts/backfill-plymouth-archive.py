#!/usr/bin/env python3
"""Create a Plymouth-only current-inventory seed from an official monthly DfT archive.
Public data, no credentials. Keeps original event clocks and records provenance.
Archive snapshots are supplementary and are not used for automatic driver alerts.
"""
import argparse,concurrent.futures,datetime,gzip,hashlib,json,os,re,time,urllib.request,zipfile
from pathlib import Path
from zoneinfo import ZoneInfo
p=argparse.ArgumentParser();p.add_argument('--month',default='2026/10');p.add_argument('--as-of',default=datetime.datetime.now(ZoneInfo('Europe/London')).date().isoformat());a=p.parse_args()
if not re.fullmatch(r'20\d\d/(0[1-9]|1[0-2])',a.month):raise SystemExit('Invalid archive month')
source='https://opendata.manage-roadworks.service.gov.uk/permit/'+a.month+'.zip'
folder=Path('/workspace/artifacts/street-manager-data-completion');folder.mkdir(parents=True,exist_ok=True)
archive=folder/('permit-'+a.month.replace('/','-')+'.zip')
head=urllib.request.urlopen(urllib.request.Request(source,headers={'Range':'bytes=0-0','User-Agent':'NeedACabPlus-Roadworks/1.0 (+https://webapp.needacabplus.app)'}),timeout=30)
if head.status!=206:raise SystemExit('Archive must support bounded range requests')
size=int(head.headers['Content-Range'].split('/')[-1]);head.close()
if size>2_000_000_000:raise SystemExit('Archive exceeds 2 GB bounded import budget')
if not archive.exists() or archive.stat().st_size!=size or not zipfile.is_zipfile(archive):
 fd=os.open(archive,os.O_CREAT|os.O_TRUNC|os.O_RDWR,0o600);os.ftruncate(fd,size)
 chunk=16*1024*1024;ranges=[(start,min(start+chunk,size)) for start in range(0,size,chunk)]
 def download(pair):
  start,end=pair
  for attempt in range(3):
   try:
    req=urllib.request.Request(source,headers={'Range':f'bytes={start}-{end-1}','User-Agent':'NeedACabPlus-Roadworks/1.0 (+https://webapp.needacabplus.app)'})
    with urllib.request.urlopen(req,timeout=45) as response:
     if response.status!=206 or response.headers.get('Content-Range')!=f'bytes {start}-{end-1}/{size}':raise RuntimeError('Invalid archive range response')
     body=response.read(end-start+1)
     if len(body)!=end-start:raise RuntimeError('Incomplete archive range')
     written=os.pwrite(fd,body,start)
     if written!=len(body):raise RuntimeError('Incomplete local archive write')
    return end-start
   except Exception:
    if attempt==2:raise
    time.sleep(2**attempt)
 try:
  with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
   done=0
   for count,length in enumerate(pool.map(download,ranges),1):
    done+=length
    if count%8==0 or count==len(ranges):print(f'Archive downloaded {done}/{size} bytes',flush=True)
 finally:os.close(fd)
sha=hashlib.file_digest(archive.open('rb'),'sha256').hexdigest();latest={};matched=0;scanned=0;invalid=0
needle=re.compile(rb'"highway_authority_swa_code"\s*:\s*"?1160"?\s*[,}]')
with zipfile.ZipFile(archive) as z, (folder/'plymouth-archive-events.ndjson').open('w') as audit:
 for item in z.infolist():
  if item.is_dir() or not item.filename.endswith('.json'):continue
  if item.file_size>300000:invalid+=1;continue
  raw=z.read(item);scanned+=1
  if needle.search(raw):
   try:
    event=json.loads(raw);d=event['object_data']
    if str(d.get('highway_authority_swa_code','')).strip()!='1160' or event['object_type']!='PERMIT':continue
    at=datetime.datetime.fromisoformat(event['event_time'].replace('Z','+00:00'))
    if at.tzinfo is None:raise ValueError('Missing archive timezone')
    key=(event['object_type'],str(d.get('work_reference_number') or event['object_reference']))
    previous=latest.get(key)
    if previous is None or at>previous[0]:latest[key]=(at,[event])
    elif at==previous[0] and event['event_reference'] not in {e['event_reference'] for e in previous[1]}:previous[1].append(event)
    matched+=1;audit.write(json.dumps(event,separators=(',',':'))+'\n')
   except (ValueError,KeyError,TypeError):invalid+=1
  if scanned%150000==0:print(f'Archive scanned {scanned} events; Plymouth matches {matched}',flush=True)
selected=[]
for at,events in latest.values():
 for event in events:
  d=event['object_data'];end=str(d.get('proposed_end_time') or d.get('proposed_end_date') or '')[:10]
  if d.get('actual_end_date_time') or d.get('work_status_ref') in ['completed','cancelled','historical'] or d.get('permit_status') in ['cancelled','revoked','refused','closed'] or re.search(r'CANCELLED|REVOKED|REFUSED|CLOSED|WORK_STOP$',event['event_type']):continue
  if end and re.fullmatch(r'\d{4}-\d\d-\d\d',end) and end<a.as_of:continue
  selected.append(event)
selected.sort(key=lambda e:(e['event_time'],str(e['event_reference'])))
report={'source_url':source,'archive_sha256':sha,'as_of':a.as_of,'events_scanned':scanned,'plymouth_events':matched,'plymouth_work_references':len(latest),'current_inventory_events':len(selected),'invalid_or_oversized':invalid,'coverage_note':'October snapshots only; later changes before webhook activation may be missing. Supplementary map data, excluded from automatic driver alerts.'}
seed={**report,'events':selected};payload=json.dumps(seed,separators=(',',':'),ensure_ascii=False).encode()
output=Path('data/street-manager/plymouth-archive-'+a.month.replace('/','-')+'.json.gz');output.write_bytes(gzip.compress(payload,mtime=0));report['seed_sha256']=hashlib.sha256(output.read_bytes()).hexdigest();report['seed_bytes']=output.stat().st_size
(folder/'archive-import-report.json').write_text(json.dumps(report,indent=2));print(json.dumps(report,indent=2),flush=True)
