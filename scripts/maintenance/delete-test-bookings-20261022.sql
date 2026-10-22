-- Supply the reviewed JSON ID manifest through SET LOCAL maintenance.test_booking_refs before running.
-- The executed manifest is retained in the session workspace, not embedded in source control.
-- Explicit user request: delete bookings matching the previously reported test-text criterion.
-- Frozen manifest: 1,115 current canonical references, after the Exeter deletion.
SET LOCAL statement_timeout='180s';
SET LOCAL lock_timeout='5s';
CREATE TEMP TABLE test_delete_refs ON COMMIT DROP AS
 SELECT jsonb_array_elements_text(current_setting('maintenance.test_booking_refs')::jsonb) external_id;
ALTER TABLE test_delete_refs ADD PRIMARY KEY(external_id);
CREATE TEMP TABLE test_delete_bookings ON COMMIT DROP AS
 SELECT b.id,b."externalId" FROM public."Booking" b JOIN test_delete_refs r ON r.external_id=b."externalId" WHERE b.provider='AUTOCAB';
ALTER TABLE test_delete_bookings ADD PRIMARY KEY(id);
DO $$ BEGIN
 IF (SELECT count(*) FROM test_delete_refs)<>1115 THEN RAISE EXCEPTION 'Deletion scope changed; re-audit required';END IF;
 IF (SELECT count(*) FROM test_delete_bookings)<>1115 THEN RAISE EXCEPTION 'Canonical target count changed';END IF;
 IF EXISTS(SELECT 1 FROM "Booking" b JOIN test_delete_bookings t ON t.id=b.id WHERE concat_ws(' ',b."customerName",b."ourReference",b."officeNote",b."driverNote",b."accountName") NOT ILIKE '%test%') THEN RAISE EXCEPTION 'Target no longer matches test criterion';END IF;
END $$;
INSERT INTO public.deleted_autocab_booking_refs(external_id,reason)
 SELECT external_id,'Administrator requested permanent deletion of bookings containing test in customer name, reference, or notes (22 October 2026).' FROM test_delete_refs ON CONFLICT DO NOTHING;
DELETE FROM autocab_history.assignment_repair_audit a USING test_delete_bookings b WHERE a.booking_id=b.id;
DELETE FROM autocab_history.canonical_queue q USING test_delete_refs r WHERE q.original_booking_id=r.external_id;
DELETE FROM public."WebhookEvent" e WHERE e."externalBookingId" IN(SELECT external_id FROM test_delete_refs) OR e."bookingId" IN(SELECT id FROM test_delete_bookings);
DELETE FROM public.autocab_bookings p USING test_delete_refs r WHERE p.autocab_id=r.external_id;
DELETE FROM public."Booking" b USING test_delete_bookings d WHERE b.id=d.id;
DELETE FROM autocab_history.entries e USING test_delete_refs r WHERE e.original_booking_id=r.external_id;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public."Booking" b JOIN test_delete_refs r ON r.external_id=b."externalId" WHERE b.provider='AUTOCAB') OR EXISTS(SELECT 1 FROM autocab_history.entries e JOIN test_delete_refs r ON r.external_id=e.original_booking_id) THEN RAISE EXCEPTION 'Deletion verification failed';END IF;
 RAISE NOTICE 'TEST_BOOKING_DELETION %',jsonb_build_object('booking_refs',(SELECT count(*) FROM test_delete_refs),'canonical_bookings',(SELECT count(*) FROM test_delete_bookings),'remaining_live_bookings',(SELECT count(*) FROM public."Booking"),'replay_suppression_refs',(SELECT count(*) FROM public.deleted_autocab_booking_refs));
END $$;
