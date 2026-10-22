-- Configuration only; booking categories are evaluated from each saved snapshot.
CREATE TABLE IF NOT EXISTS public.hackney_configuration (
 id boolean PRIMARY KEY DEFAULT true CHECK(id),
 settings jsonb NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.hackney_configuration(id,settings)
VALUES(true,'{"prefixes":["9","4"],"flaggedSources":["FlaggedBooking"]}') ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS public.deleted_autocab_booking_refs (
 external_id text PRIMARY KEY,
 reason text NOT NULL,
 deleted_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT,INSERT,UPDATE ON public.hackney_configuration TO needacabplus_shared_app;
GRANT SELECT ON public.hackney_configuration,public.deleted_autocab_booking_refs TO needacabplus_shared_reader,cabby_ro,needacabplus_shared_app;
