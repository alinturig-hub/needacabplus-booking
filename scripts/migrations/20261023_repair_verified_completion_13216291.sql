-- Run in a transaction. Repairs only the independently verified reference.
-- Original provider JSON, events and snapshots are retained unchanged.
SET LOCAL statement_timeout='15s';
DO $$ DECLARE b public."Booking"%ROWTYPE; e public."WebhookEvent"%ROWTYPE; BEGIN
 SELECT * INTO b FROM public."Booking" WHERE provider='AUTOCAB' AND "externalId"='13216291' FOR UPDATE;
 IF NOT FOUND OR b.status<>'POB' OR b."completedAt" IS NULL THEN RAISE NOTICE 'REPAIR_SKIPPED: booking no longer matches verified state';RETURN;END IF;
 SELECT * INTO e FROM public."WebhookEvent" WHERE "bookingId"=b.id AND status='PROCESSED' AND "eventType"='BookingComplete' ORDER BY "receivedAt" DESC LIMIT 1;
 IF NOT FOUND OR e.payload->>'CompletedAtTime' IS NULL OR abs(extract(epoch FROM (b."completedAt"-((e.payload->>'CompletedAtTime')::timestamptz AT TIME ZONE 'UTC'))))>0.001 THEN RAISE EXCEPTION 'Completion evidence missing or conflicting';END IF;
 IF EXISTS(SELECT 1 FROM public."WebhookEvent" WHERE "bookingId"=b.id AND status='PROCESSED' AND "receivedAt">e."receivedAt" AND "eventType" NOT IN('BookingModified','BookingRunningLate')) THEN RAISE EXCEPTION 'Newer lifecycle event requires review';END IF;
 UPDATE public."Booking" SET status='COMPLETED',"updatedAt"=CURRENT_TIMESTAMP WHERE id=b.id;
 UPDATE public.autocab_bookings SET operational_status='COMPLETED' WHERE booking_id=b.id;
 INSERT INTO public."BookingTimelineEvent"(id,"bookingId","eventType",title,description,source,metadata,"occurredAt","createdAt","updatedAt") VALUES('completion-status-repair-13216291-20261023',b.id,'CompletionStatusReconciled','Completion status reconciled','Status corrected from verified processed BookingComplete; original provider payload retained.','SYSTEM',jsonb_build_object('previousStatus',b.status,'previousUpdatedAt',b."updatedAt",'evidenceWebhookEventId',e.id,'completionAt',b."completedAt"),CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT(id) DO NOTHING;
 RAISE NOTICE 'REPAIRED reference=13216291 status=COMPLETED';
END $$;
