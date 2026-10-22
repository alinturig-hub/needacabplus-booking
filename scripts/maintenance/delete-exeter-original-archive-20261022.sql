SET LOCAL statement_timeout='90s';SET LOCAL lock_timeout='5s';
DO $$ BEGIN
 IF current_database()<>'needacabplus_archive_20261018' THEN RAISE EXCEPTION 'Unexpected archive database';END IF;
 IF (SELECT count(*) FROM public.autocab_bookings WHERE company_id='4')<>16026 OR (SELECT count(DISTINCT archived_booking->>'originalAutoID') FROM public.autocab_bookings WHERE company_id='4')<>9301 THEN RAISE EXCEPTION 'Source archive scope changed; re-audit required';END IF;
END $$;
DELETE FROM public.autocab_bookings WHERE company_id='4';
DO $$ BEGIN RAISE NOTICE 'EXETER_SOURCE_DELETION %',jsonb_build_object('remaining_company4',(SELECT count(*) FROM public.autocab_bookings WHERE company_id='4'));END $$;
