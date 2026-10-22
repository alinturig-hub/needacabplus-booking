-- Explicit user request: permanently remove Needacab Exeter booking records.
-- Autocab company 4 was confirmed as Needacab Exeter from saved registry JSON.
SET LOCAL statement_timeout='180s';
SET LOCAL lock_timeout='5s';
CREATE TEMP TABLE exeter_delete_refs ON COMMIT DROP AS
 SELECT DISTINCT original_booking_id external_id FROM autocab_history.entries WHERE company_id='4'
 UNION SELECT "externalId" FROM public."Booking" WHERE provider='AUTOCAB' AND "companyId"='4';
ALTER TABLE exeter_delete_refs ADD PRIMARY KEY(external_id);
CREATE TEMP TABLE exeter_delete_bookings ON COMMIT DROP AS
 SELECT b.id,b."externalId" FROM public."Booking" b JOIN exeter_delete_refs r ON r.external_id=b."externalId" WHERE b.provider='AUTOCAB';
ALTER TABLE exeter_delete_bookings ADD PRIMARY KEY(id);
DO $$ BEGIN
 IF (SELECT count(*) FROM exeter_delete_refs)<>9301 THEN RAISE EXCEPTION 'Deletion scope changed; re-audit required';END IF;
 IF EXISTS(SELECT 1 FROM autocab_history.entries e JOIN exeter_delete_refs r ON r.external_id=e.original_booking_id WHERE e.company_id IS DISTINCT FROM '4') THEN RAISE EXCEPTION 'Mixed company booking detected';END IF;
END $$;
INSERT INTO public.deleted_autocab_booking_refs(external_id,reason)
 SELECT external_id,'Administrator requested permanent deletion of Needacab Exeter bookings, Autocab company 4.' FROM exeter_delete_refs ON CONFLICT DO NOTHING;
DELETE FROM autocab_history.assignment_repair_audit a USING exeter_delete_bookings b WHERE a.booking_id=b.id;
DELETE FROM autocab_history.canonical_queue q USING exeter_delete_refs r WHERE q.original_booking_id=r.external_id;
DELETE FROM public."WebhookEvent" e WHERE e."externalBookingId" IN(SELECT external_id FROM exeter_delete_refs) OR e."bookingId" IN(SELECT id FROM exeter_delete_bookings);
DELETE FROM public.autocab_bookings p USING exeter_delete_refs r WHERE p.autocab_id=r.external_id;
DELETE FROM public."Booking" b USING exeter_delete_bookings d WHERE b.id=d.id;
DELETE FROM autocab_history.entries e USING exeter_delete_refs r WHERE e.original_booking_id=r.external_id;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public."Booking" b JOIN exeter_delete_refs r ON r.external_id=b."externalId" WHERE b.provider='AUTOCAB') OR EXISTS(SELECT 1 FROM autocab_history.entries WHERE company_id='4') THEN RAISE EXCEPTION 'Deletion verification failed';END IF;
 RAISE NOTICE 'EXETER_DELETION %',jsonb_build_object('booking_refs',(SELECT count(*) FROM exeter_delete_refs),'canonical_bookings',(SELECT count(*) FROM exeter_delete_bookings),'remaining_live_bookings',(SELECT count(*) FROM public."Booking"),'replay_suppression_refs',(SELECT count(*) FROM public.deleted_autocab_booking_refs));
END $$;
