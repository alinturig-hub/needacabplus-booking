# Verification evidence — 5 November 2026

Command run from the isolated development checkout:

```sh
CONVERSATION_CONTRACT_MIRROR=/workspace/conversation-contract-crm/docs/integrations/conversation-editor PYTHONDONTWRITEBYTECODE=1 python docs/conversations/tests/validate_proposal.py
```

Result: 9 test methods passed (all six lifecycle fixtures, valid read/create examples, invalid event identity/version/source/mode/unknown fields, invalid expiry, missing read ownership/revision, missing create confirmation, arbitrary HTTP/SQL/Meta actions denied, strict parameters, exact cross-repository mirrored proposal bytes).

Dependencies: Python 3 and existing jsonschema. No package/dependency change. Tests do not import application modules, access a database, call a network endpoint or dispatch messages. HMAC, ownership, confirmation consumption, revision allocation and PostgreSQL races are documented future integration tests, not verified runtime guarantees.

Inspected deployed commit metadata and whitelisted boolean flag values through GET only. No production data or customer record was read. No migrations or SQL executed. No config changes, Meta calls, booking actions or sends.
