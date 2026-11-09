#!/usr/bin/env python3
"""Optional approximate map positions for public council notices.
Uses cached, rate-limited Photon OpenStreetMap road lookups; never verifies alert eligibility.
Exact road-name and local bounds checks reject unrelated fuzzy search results.
"""
import json,re,time,urllib.request,urllib.parse,datetime,argparse
from pathlib import Path
parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('notices',type=Path);parser.add_argument('--cache',type=Path,default=Path('.cache/photon-roads'));args=parser.parse_args()
notices=json.loads(args.notices.read_text());out=Path('data/street-manager/council-locations.json');locations=json.loads(out.read_text()) if out.exists() else {}
cache=args.cache;cache.mkdir(parents=True,exist_ok=True)
def clean(n):return re.sub(r'\s+',' ',re.sub(r'[^a-z0-9 ]',' ',re.sub(r'\([^)]*\)','',n).lower())).strip()
def get(name):
 key=clean(name);path=cache/(key.replace(' ','-')+'.json')
 if path.exists():return json.loads(path.read_text())
 time.sleep(1.1)
 url='https://photon.komoot.io/api/?'+urllib.parse.urlencode({'q':name+' Plymouth','limit':8,'lat':50.40,'lon':-4.14,'bbox':'-4.26,50.30,-3.93,50.51'})
 try:
  data=json.load(urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'NeedACabPlus-Roadworks/1.0 (+https://webapp.needacabplus.app)'}),timeout=15));features=[]
  for f in data.get('features',[]):
   p=f.get('properties',{});c=f.get('geometry',{}).get('coordinates',[])
   if p.get('osm_key')!='highway' or clean(p.get('name',''))!=key or len(c)!=2 or not(-4.26<=c[0]<=-3.93 and 50.30<=c[1]<=50.51):continue
   features.append({'point':c,'name':p['name'],'osm_id':p.get('osm_id')})
 except Exception:features=[]
 path.write_text(json.dumps(features));return features
for index,n in enumerate(notices,1):
 if n['id'] in locations:continue
 if '/' in n['street']:continue
 name=re.sub(r'\([^)]*\)','',n['street']).strip();matches=get(name)
 if not matches:continue
 # If the street has several widely separated indexed pieces, the reported
 # affected segment cannot be inferred confidently. Leave it unmapped.
 points=[m['point'] for m in matches];first=points[0]
 if any(((p[0]-first[0])*71000)**2+((p[1]-first[1])*111195)**2>650**2 for p in points):continue
 locations[n['id']]={'geometry':{'type':'Point','coordinates':first},'quality':'approximate','basis':'street','source':'OpenStreetMap','checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat()}
 if index%10==0:print('Approximate council locations:',len(locations),'of',len(notices),flush=True)
 out.write_text(json.dumps(locations,separators=(',',':')))
out.write_text(json.dumps(locations,separators=(',',':')));print(json.dumps({'notices':len(notices),'approximate_locations':len(locations),'pending_review':len(notices)-len(locations)}),flush=True)
