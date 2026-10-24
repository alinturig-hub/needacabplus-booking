ALTER TABLE public.driver_app_jobs ADD COLUMN IF NOT EXISTS service_type text NOT NULL DEFAULT 'ASAP' CHECK(service_type IN('ASAP','Priority','Prebook','Guarantee'));
