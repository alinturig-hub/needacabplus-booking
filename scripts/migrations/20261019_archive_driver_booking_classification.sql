-- Archive-only read models. Retain every original profile and booking payload.
-- Active registry state is current; booking classification uses its own snapshot.
CREATE OR REPLACE VIEW autocab_driver_classification AS
SELECT d.*,
       raw_payload->'active' = 'true'::jsonb AS is_active,
       raw_payload->'suspended' = 'true'::jsonb AS is_suspended,
       NULLIF(btrim(raw_payload->>'archivedDate'), '') IS NOT NULL AS is_archived,
       CASE WHEN NULLIF(btrim(callsign), '') IS NULL THEN 'UNKNOWN'
            WHEN btrim(callsign) LIKE '9%' THEN 'HACKNEY'
            ELSE 'PRIVATE_HIRE' END AS driver_category
FROM autocab_drivers d;

-- Unknown suspension status is not treated as eligible; active is not online.
CREATE OR REPLACE VIEW autocab_active_drivers AS
SELECT * FROM autocab_driver_classification
WHERE is_active IS TRUE AND is_suspended IS FALSE AND is_archived IS FALSE;

CREATE OR REPLACE VIEW autocab_booking_classification AS
SELECT b.*,
       NULLIF(archived_booking->>'originalAutoID', '') AS original_booking_id,
       archived_booking->'driver'->>'id' AS snapshot_driver_id,
       archived_booking->'driver'->>'callsign' AS snapshot_driver_callsign,
       raw_payload->>'bookingSource' AS booking_source,
       raw_payload->>'bookingSource' = 'FlaggedBooking' AS is_flagged_booking,
       CASE WHEN NULLIF(btrim(archived_booking->'driver'->>'callsign'), '') IS NULL THEN 'UNKNOWN'
            WHEN btrim(archived_booking->'driver'->>'callsign') LIKE '9%' THEN 'HACKNEY'
            ELSE 'PRIVATE_HIRE' END AS driver_category,
       CASE WHEN raw_payload->>'bookingSource' = 'FlaggedBooking' THEN 'FLAGGED_BOOKING'
            WHEN NULLIF(btrim(raw_payload->>'bookingSource'), '') IS NULL THEN 'UNKNOWN'
            WHEN NULLIF(btrim(archived_booking->'driver'->>'callsign'), '') IS NULL THEN 'UNKNOWN'
            WHEN btrim(archived_booking->'driver'->>'callsign') LIKE '9%' THEN 'HACKNEY_BOOKING'
            ELSE 'PRIVATE_HIRE_BOOKING' END AS service_category
FROM autocab_bookings b;
