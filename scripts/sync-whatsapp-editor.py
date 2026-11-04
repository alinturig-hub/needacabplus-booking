#!/usr/bin/env python3
"""Generate the NAC copy of TaxiCRM's shared editor. Never edit generated files.
Usage: python3 scripts/sync-whatsapp-editor.py /path/to/taxicrm [--check]
Validation remains owned by TaxiCRM; this copies the identical browser component.
"""
from pathlib import Path
import sys,hashlib,json
source=Path(sys.argv[1]);target=Path(__file__).resolve().parents[1]/'components/shared-whatsapp'
items={'WhatsAppTemplateEditor.tsx':'src/components/marketing/WhatsAppTemplateEditor.tsx',**{n:f'src/lib/integrations/whatsapp/{n}' for n in ['editor-types.ts','template-parameters.ts','template-error.ts']}}
manifest={}
for name,path in items.items():
 raw=(source/path).read_text();text=raw.replace('@/lib/integrations/whatsapp/','./');manifest[path]=hashlib.sha256(raw.encode()).hexdigest()
 if '--check' in sys.argv:
  assert (target/name).read_text()==text,name+' differs from shared source'
 else:
  target.mkdir(parents=True,exist_ok=True);(target/name).write_text(text)
if '--check' in sys.argv:assert json.loads((target/'source-manifest.json').read_text())==manifest,'Source manifest differs'
if '--check' not in sys.argv:(target/'source-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print('Shared editor verified' if '--check' in sys.argv else 'Shared editor generated')
