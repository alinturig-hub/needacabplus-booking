// A historical booking status alone is not proof of a currently active trip.
export const livePassengerSql=`WITH latest AS (
 SELECT DISTINCT ON (COALESCE(NULLIF(vehicle_id,''),driver_id)) booking_id,vehicle_status,recorded_at
 FROM driver_positions WHERE COALESCE(recorded_at,received_at)>now()-interval '5 minutes'
 ORDER BY COALESCE(NULLIF(vehicle_id,''),driver_id),COALESCE(recorded_at,received_at) DESC,id DESC
 ) SELECT COUNT(DISTINCT b.id)::text AS total FROM bookings b WHERE b.status='Passenger On Board'
 AND EXISTS(SELECT 1 FROM latest p WHERE p.booking_id::text IN (b.external_booking_id,b.original_booking_id)
 AND p.recorded_at>now()-interval '5 minutes' AND p.recorded_at<=now()+interval '1 minute'
 AND regexp_replace(lower(p.vehicle_status),'[^a-z]','','g') IN ('pob','passengeronboard','onboard'))`;
