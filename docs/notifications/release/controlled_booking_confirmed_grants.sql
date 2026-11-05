-- REVIEW ONLY. Apply once to the approved shared database after both table migrations.
-- Additive ACL delta; does not create roles, change logins/owners, grant DELETE or touch bookings.
DO $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='needacabplus_shared_app') THEN
  RAISE EXCEPTION 'Expected NAC runtime role is missing';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='taxicrm_shared_app') THEN
  RAISE EXCEPTION 'Expected TaxiCRM runtime role is missing';
 END IF;
 IF to_regclass('public.notification_rules') IS NULL
 OR to_regclass('public.notification_rule_revisions') IS NULL
 OR to_regclass('public.notification_decisions') IS NULL
 OR to_regclass('public.notification_decisions_id_seq') IS NULL
 OR to_regclass('public.notification_controlled_events') IS NULL
 OR to_regclass('public."WhatsAppControlledDispatch"') IS NULL
 OR to_regclass('public."WhatsAppOutboundMessage"') IS NULL THEN
  RAISE EXCEPTION 'Required reviewed notification tables/sequence are missing';
 END IF;
END $$;

GRANT USAGE ON SCHEMA public TO needacabplus_shared_app, taxicrm_shared_app;

-- NAC Notifications rule/preview persistence introduced earlier in draft PR31.
GRANT SELECT, INSERT, UPDATE ON TABLE public.notification_rules TO needacabplus_shared_app;
GRANT SELECT, INSERT ON TABLE public.notification_rule_revisions TO needacabplus_shared_app;
GRANT SELECT, INSERT ON TABLE public.notification_decisions TO needacabplus_shared_app;
GRANT USAGE, SELECT ON SEQUENCE public.notification_decisions_id_seq TO needacabplus_shared_app;

-- NAC owns event registration and status projection, but cannot delete/re-key it through these grants.
GRANT SELECT, INSERT ON TABLE public.notification_controlled_events TO needacabplus_shared_app;
GRANT UPDATE (status, result, provider_message_id)
 ON TABLE public.notification_controlled_events TO needacabplus_shared_app;

-- CRM reads/locks the canonical fence. FOR UPDATE requires an UPDATE privilege on at least one column.
GRANT SELECT (operation_key, fence), UPDATE (fence)
 ON TABLE public.notification_controlled_events TO taxicrm_shared_app;

-- CRM owns only the new controlled dispatch registration and its outcomes.
GRANT SELECT, INSERT ON TABLE public."WhatsAppControlledDispatch" TO taxicrm_shared_app;
GRANT UPDATE (status, result, provider_message_id)
 ON TABLE public."WhatsAppControlledDispatch" TO taxicrm_shared_app;

-- NAC's read-only activation preflight checks existence, not message bodies or recipient data.
GRANT SELECT (scope, operation_key)
 ON TABLE public."WhatsAppControlledDispatch" TO needacabplus_shared_app;
GRANT SELECT ("connectionKey", "operationKey")
 ON TABLE public."WhatsAppOutboundMessage" TO needacabplus_shared_app;

-- Existing shared nonce/inbox/event/outbox privileges are prerequisites, not broadened here.
-- In particular, this script grants no UPDATE on Booking/BookingLocation/customer records,
-- no CRM role access to NAC rule editing, and no permission to resend/reset prior operations.
