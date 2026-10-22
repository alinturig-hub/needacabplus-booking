SET TRANSACTION READ ONLY;SET LOCAL statement_timeout='100s';SET LOCAL ROLE needacabplus_shared_reader;
DO $$ DECLARE result jsonb;BEGIN
WITH m AS MATERIALIZED(SELECT id,"externalId",status,"bookingSource" source,"pickupDueTime","driverId","driverCallSign","dispatchedAt","pickedUpAt",CASE WHEN distance IS NULL AND "systemDistance" IS NULL AND "meterDistance" IS NULL AND "meterDistanceMetres" IS NULL AND "gpsMeterDistance" IS NULL AND "estimatedDistance" IS NULL THEN 'all_null' ELSE 'zero_or_nonpositive' END cohort,
 least(distance,"systemDistance","meterDistance","meterDistanceMetres","gpsMeterDistance","estimatedDistance")<0 negative
 FROM "Booking" WHERE greatest(COALESCE(distance,0),COALESCE("systemDistance",0),COALESCE("meterDistance",0),COALESCE("meterDistanceMetres",0),COALESCE("gpsMeterDistance",0),COALESCE("estimatedDistance",0))<=0),
g AS MATERIALIZED(SELECT m.*,a.original_booking_id,CASE WHEN "pickupDueTime"<'2022-09-29T23:00:00'::timestamp THEN 'before_archive_window' WHEN "pickupDueTime">'2026-10-20T09:00:00'::timestamp THEN 'after_archive_window' WHEN "pickupDueTime" IS NULL THEN 'unknown_pickup_date' ELSE 'inside_archive_window' END archive_window FROM m LEFT JOIN LATERAL(SELECT original_booking_id FROM autocab_history.entries e WHERE e.original_booking_id=m."externalId" LIMIT 1)a ON true)
SELECT jsonb_build_object(
 'gaps',(SELECT jsonb_agg(x) FROM(SELECT cohort,archive_window,count(*) jobs,count(*)FILTER(WHERE status='COMPLETED') completed_status,min("pickupDueTime") first_pickup,max("pickupDueTime") last_pickup FROM g WHERE original_booking_id IS NULL GROUP BY 1,2 ORDER BY 1,2)x),
 'negative_distance',(SELECT count(*) FROM m WHERE negative),
 'final_counts',(SELECT jsonb_build_object('jobs',count(*),'all_null',count(*)FILTER(WHERE cohort='all_null'),'driver',count(*)FILTER(WHERE (nullif(btrim("driverId"),'') IS NOT NULL AND btrim("driverId")<>'0') OR (nullif(btrim("driverCallSign"),'') IS NOT NULL AND btrim("driverCallSign")<>'0')),'dispatched',count(*)FILTER(WHERE "dispatchedAt" IS NOT NULL),'pob',count(*)FILTER(WHERE "pickedUpAt" IS NOT NULL)) FROM m)
) INTO result;RAISE NOTICE 'NO_POSITIVE_ARCHIVE_GAPS %',result;END $$;
