-- Apply only after validating the isolated restore and before enabling the
-- Need A Cab Plus worker. This expands NAC permissions; it does not revoke
-- TaxiCRM permissions or switch either application.
DO $$
DECLARE
  table_name text;
  sequence_name text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'needacabplus_shared_app') THEN
    RAISE EXCEPTION 'needacabplus_shared_app role is missing';
  END IF;

  FOREACH table_name IN ARRAY ARRAY[
    'Booking', 'BookingLocation', 'BookingVia', 'BookingTimelineEvent',
    'BookingSnapshot', 'WebhookEvent', 'NormalCustomer'
  ] LOOP
    IF to_regclass(format('public.%I', table_name)) IS NULL THEN
      RAISE EXCEPTION 'Canonical table % is missing', table_name;
    END IF;
    EXECUTE format(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO needacabplus_shared_app',
      table_name
    );
    FOR sequence_name IN
      SELECT seq.relname
      FROM pg_class seq
      JOIN pg_namespace ns ON ns.oid = seq.relnamespace
      JOIN pg_depend dep ON dep.objid = seq.oid AND dep.deptype IN ('a', 'i')
      JOIN pg_class tbl ON tbl.oid = dep.refobjid
      WHERE ns.nspname = 'public' AND seq.relkind = 'S'
        AND tbl.oid = to_regclass(format('public.%I', table_name))
    LOOP
      EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE public.%I TO needacabplus_shared_app', sequence_name);
    END LOOP;
  END LOOP;
END $$;
