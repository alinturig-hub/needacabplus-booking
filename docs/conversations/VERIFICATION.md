# Verification evidence — 5 November 2026

Command run from the isolated development checkout:

```sh
CONVERSATION_CONTRACT_MIRROR=/workspace/conversation-contract-crm/docs/integrations/conversation-editor PYTHONDONTWRITEBYTECODE=1 python docs/conversations/tests/validate_proposal.py
```

Result: 9 test methods passed (all six lifecycle fixtures, valid read/create examples, invalid event identity/version/source/mode/unknown fields, invalid expiry, missing read ownership/revision, missing create confirmation, arbitrary HTTP/SQL/Meta actions denied, strict parameters, exact cross-repository mirrored proposal bytes).

Dependencies: Python 3 and existing jsonschema. No package/dependency change. Tests do not import application modules, access a database, call a network endpoint or dispatch messages. HMAC, ownership, confirmation consumption, revision allocation and PostgreSQL races are documented future integration tests, not verified runtime guarantees.

Inspected deployed commit metadata and whitelisted boolean flag values through GET only. No production data or customer record was read. No migrations or SQL executed. No config changes, Meta calls, booking actions or sends.

## Portable commands for review checkouts

NAC (run from repository root):
```sh
PYTHONDONTWRITEBYTECODE=1 python docs/conversations/tests/validate_proposal.py
```
TaxiCRM (run from repository root):
```sh
PYTHONDONTWRITEBYTECODE=1 python docs/integrations/conversation-editor/tests/validate_proposal.py
```
Each command discovers the same nine test methods; the mirror test skips unless the local counterpart is explicitly supplied. To run all nine without skips, from the NAC root with both repositories checked out as siblings:
```sh
CONVERSATION_CONTRACT_MIRROR=../taxicrm/docs/integrations/conversation-editor PYTHONDONTWRITEBYTECODE=1 python docs/conversations/tests/validate_proposal.py
```
Adjust the counterpart path for your checkout layout. Requires Python 3 and jsonschema (review-only tooling, no application dependency change). The cross-repository run recorded above passed all nine without skips.

Flag observation correction: the original summary conflated preview/production entries. See SHARED_EDITOR_CONTRACT.md and flag-observation-20261105.json for exact GET resources, timestamps and distinct rows. Both applications' production configuration entries were false at the recorded observation; TaxiCRM preview alone had Meta/test flags true. No running-process environment verification or configuration mutation was performed.
