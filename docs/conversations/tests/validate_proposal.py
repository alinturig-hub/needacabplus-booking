"""Offline proposal checks only. No application imports, DB, network or provider calls."""
import copy
import json
import unittest
from datetime import datetime
from pathlib import Path
from jsonschema import Draft202012Validator, FormatChecker
ROOT = Path(__file__).resolve().parents[1]
def read(name):
    return json.loads((ROOT/name).read_text())
def validator(name):
    schema=read(name)
    Draft202012Validator.check_schema(schema)
    return Draft202012Validator(schema,format_checker=FormatChecker())
def valid_event(data):
    validator('event.schema.json').validate(data)
    start=datetime.fromisoformat(data['occurred_at'].replace('Z','+00:00'))
    end=datetime.fromisoformat(data['expires_at'].replace('Z','+00:00'))
    if not 0 < (end-start).total_seconds() <= 900:
        raise ValueError('INVALID_EVENT_EXPIRY')
class ProposalTests(unittest.TestCase):
    def test_all_six_events(self):
        paths=list((ROOT/'examples').glob('*.json'))
        events=[json.loads(p.read_text()) for p in paths if not p.name.startswith('action.')]
        self.assertEqual(len(events),6)
        self.assertEqual(len({e['event_id'] for e in events}),6)
        for event in events: valid_event(event)
    def test_action_examples(self):
        for name in ['action.read.json','action.create.json']:
            validator('action.schema.json').validate(read('examples/'+name))
    def test_event_negative_cases(self):
        original=read('examples/booking.confirmed.json')
        for patch in [{'contract_version':'2.0'},{'mode':'LIVE'},{'booking_revision':0},{'event_id':'bad'},{'event_type':'booking.dispatched'},{'source':'taxicrm'},{'phone':'+447700900123'},{'occurred_at':'invalid'}]:
            with self.subTest(patch=patch),self.assertRaises(Exception):valid_event({**original,**patch})
    def test_invalid_expiry(self):
        for t in ['2026-11-05T12:00:00Z','2026-11-05T13:00:00Z']:
            with self.assertRaises(ValueError):valid_event({**read('examples/booking.confirmed.json'),'expires_at':t})
    def test_read_requires_authority_and_revision(self):
        for field in ['customer_authorization_ref','booking_ref','expected_booking_revision']:
            obj=read('examples/action.read.json');obj.pop(field)
            with self.assertRaises(Exception):validator('action.schema.json').validate(obj)
    def test_create_requires_confirmation(self):
        obj=read('examples/action.create.json');obj.pop('confirmation_ref')
        with self.assertRaises(Exception):validator('action.schema.json').validate(obj)
    def test_action_not_arbitrary_http_or_sql(self):
        for action in ['http.fetch','sql.execute','meta.send']:
            obj=read('examples/action.read.json');obj['action']=action
            with self.assertRaises(Exception):validator('action.schema.json').validate(obj)
    def test_parameters_strict(self):
        obj=read('examples/action.read.json');obj['parameters']={'phone':'not-authorization'}
        with self.assertRaises(Exception):validator('action.schema.json').validate(obj)
    def test_shared_contract_is_byte_identical_when_mirror_exists(self):
        # Explicit optional comparison path; does not read a production checkout.
        import os
        mirror=os.environ.get('CONVERSATION_CONTRACT_MIRROR')
        if not mirror:self.skipTest('No local TaxiCRM proposal path supplied')
        for path in ROOT.rglob('*'):
            if path.is_file() and '__pycache__' not in path.parts:
                self.assertEqual(path.read_bytes(),(Path(mirror)/path.relative_to(ROOT)).read_bytes())
if __name__=='__main__':unittest.main(verbosity=2)
