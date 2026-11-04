#!/usr/bin/env python3
"""Pin exact TaxiCRM sources for the isolated staging deployment; no production adapters."""
from pathlib import Path
import sys,json,hashlib
root=Path(__file__).resolve().parents[1]
source=Path(sys.argv[1])/'src/lib/integrations/whatsapp'
target=root/'staging/notifications/generated-taxicrm'
names=['notifications-v2-contract.ts','notifications-v2-http.ts','notifications-v2-preview.ts','service-auth.ts']
manifest={}
for name in names:
 raw=(source/name).read_bytes();manifest[name]=hashlib.sha256(raw).hexdigest()
 if '--check' in sys.argv:assert (target/name).read_bytes()==raw,name+' differs'
 else:target.mkdir(parents=True,exist_ok=True);(target/name).write_bytes(raw)
if '--check' in sys.argv:assert json.loads((target/'manifest.json').read_text())==manifest
else:(target/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print('Staging source parity verified' if '--check' in sys.argv else 'Staging source snapshot generated')
