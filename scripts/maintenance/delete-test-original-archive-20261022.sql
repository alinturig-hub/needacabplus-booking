-- Supply the reviewed JSON ID manifest through SET LOCAL maintenance.test_archive_ids before running.
-- The executed manifest is retained in the session workspace, not embedded in source control.
SET LOCAL statement_timeout='90s';SET LOCAL lock_timeout='5s';
DO $$ BEGIN
 IF current_database()<>'needacabplus_archive_20261018' THEN RAISE EXCEPTION 'Unexpected archive database';END IF;
 IF (SELECT count(*) FROM public.autocab_bookings WHERE autocab_id IN(SELECT jsonb_array_elements_text(current_setting('maintenance.test_archive_ids')::jsonb)))<>2183 THEN RAISE EXCEPTION 'Archive target count changed';END IF;
END $$;
DELETE FROM public.autocab_bookings WHERE autocab_id IN(SELECT jsonb_array_elements_text(current_setting('maintenance.test_archive_ids')::jsonb));
DO $$ BEGIN RAISE NOTICE 'TEST_SOURCE_REMAINING %',(SELECT count(*) FROM public.autocab_bookings WHERE autocab_id IN(SELECT jsonb_array_elements_text(current_setting('maintenance.test_archive_ids')::jsonb)));END $$;
