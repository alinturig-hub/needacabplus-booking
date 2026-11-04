#!/usr/bin/env python3
"""Pin the one v2 protocol source in TaxiCRM; no runtime/network side effects."""
from pathlib import Path
import sys
source=Path(__file__).resolve().parents[1]/'lib/notifications/v2/contract.ts'
target=Path(sys.argv[1])/'src/lib/integrations/whatsapp/notifications-v2-contract.ts'
if '--check' in sys.argv:assert source.read_bytes()==target.read_bytes(),'v2 protocol copies differ'
else:target.write_bytes(source.read_bytes())
print('v2 shared contract verified' if '--check' in sys.argv else 'v2 shared contract generated')
