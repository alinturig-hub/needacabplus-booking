-- READ ONLY: metadata preflight. Does not apply migrations, grants, event writes or sends.
-- Run only against the owner-confirmed shared database from an authorized runtime.
BEGIN READ ONLY;
SET LOCAL statement_timeout='10s';
SET LOCAL lock_timeout='2s';
SELECT current_database() AS database_name,current_user AS role,
       current_setting('transaction_read_only') AS read_only;
SELECT rolname,rolsuper,rolcreaterole,rolcreatedb,rolbypassrls
FROM pg_roles WHERE rolname IN ('needacabplus_shared_app','taxicrm_shared_app');
WITH required(name,kind) AS (VALUES
 ('public."Booking"','existing prerequisite'),
 ('public."BookingLocation"','existing prerequisite'),
 ('public.customer_accounts','existing prerequisite'),
 ('public.web_booking_attempts','existing prerequisite'),
 ('public.whatsapp_service_nonce','existing prerequisite'),
 ('public.whatsapp_event_inbox','existing prerequisite'),
 ('public."WhatsAppConversation"','existing prerequisite'),
 ('public."WhatsAppMessage"','existing prerequisite'),
 ('public."WhatsAppSharedEvent"','existing prerequisite'),
 ('public."WhatsAppRecipientGrant"','existing prerequisite'),
 ('public."WhatsAppOutboundMessage"','existing prerequisite'),
 ('public.notification_rules','reviewed foundation'),
 ('public.notification_rule_revisions','reviewed foundation'),
 ('public.notification_decisions','reviewed foundation'),
 ('public.notification_controlled_events','new controlled migration'),
 ('public."WhatsAppControlledDispatch"','new controlled migration')
)
SELECT name,kind,to_regclass(name) IS NOT NULL AS present
FROM required ORDER BY kind,name;
-- Inspect existing triggers and owners before considering any new SECURITY DEFINER function.
SELECT n.nspname AS schema,c.relname AS relation,t.tgname AS trigger,
       pg_get_userbyid(p.proowner) AS function_owner,p.prosecdef AS security_definer,
       p.proconfig AS function_settings,pg_get_triggerdef(t.oid) AS definition
FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_proc p ON p.oid=t.tgfoid
WHERE NOT t.tgisinternal AND n.nspname='public' AND t.tgname LIKE 'controlled_%'
ORDER BY c.relname,t.tgname;
-- Additive grants must be separately reviewed. This only reports current table privileges.
SELECT r.rolname,c.relname,
 has_table_privilege(r.oid,c.oid,'SELECT') AS can_select,
 has_table_privilege(r.oid,c.oid,'INSERT') AS can_insert,
 has_table_privilege(r.oid,c.oid,'UPDATE') AS can_update_table,
 has_table_privilege(r.oid,c.oid,'DELETE') AS can_delete
FROM pg_roles r CROSS JOIN pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE r.rolname IN ('needacabplus_shared_app','taxicrm_shared_app') AND n.nspname='public'
 AND c.relname IN ('notification_rules','notification_rule_revisions','notification_decisions',
                   'notification_controlled_events','WhatsAppControlledDispatch','WhatsAppOutboundMessage')
ORDER BY r.rolname,c.relname;
-- Column ACLs (for fence/status-only access) are distinct from table-wide UPDATE/SELECT.
SELECT r.rolname,c.relname,a.attname,
 has_column_privilege(r.oid,c.oid,a.attnum,'SELECT') AS can_select,
 has_column_privilege(r.oid,c.oid,a.attnum,'UPDATE') AS can_update
FROM pg_roles r CROSS JOIN pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
WHERE r.rolname IN ('needacabplus_shared_app','taxicrm_shared_app') AND n.nspname='public'
 AND c.relname IN ('notification_controlled_events','WhatsAppControlledDispatch')
ORDER BY r.rolname,c.relname,a.attnum;
ROLLBACK;
