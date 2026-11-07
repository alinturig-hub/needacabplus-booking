# WhatsApp operator controls

Administrators can take over or release a conversation and, when the gateway enables sending, compose a free-text reply within the 24-hour customer-service window. Takeover cancels queued automatic notifications; release does not restore them. The signed gateway in TaxiCRM performs the authoritative checks, provides the single Meta transport and writes accepted replies to shared history.

A provider timeout or an unconfirmed response is not retried. The operator must check Meta and the shared history; unresolved gateway claims block new replies. Reconciliation tooling, individual operator attribution, approved-template sending outside the service window and AI replies are not part of this change. Flags remain disabled unless separately enabled during an approved rollout. The browser test and service tests use synthetic data and a fake provider.
