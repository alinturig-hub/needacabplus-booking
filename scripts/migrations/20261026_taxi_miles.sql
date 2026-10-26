CREATE TABLE IF NOT EXISTS public.taxi_miles_configuration (
 id boolean PRIMARY KEY DEFAULT true CHECK(id),settings jsonb NOT NULL DEFAULT '{}',version integer NOT NULL DEFAULT 1,updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.taxi_miles_configuration(id) VALUES(true) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS public.taxi_miles_vouchers (
 id uuid PRIMARY KEY,code text NOT NULL UNIQUE CHECK(code=upper(code)),rules jsonb NOT NULL,source text NOT NULL DEFAULT 'voucher' CHECK(source IN('voucher','reward','welcome','marketing')),customer_id uuid REFERENCES public.customer_accounts(id),
 campaign_id uuid,tier_id uuid,enabled boolean NOT NULL DEFAULT true,version integer NOT NULL DEFAULT 1,draft boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(customer_id,campaign_id,tier_id)
);
ALTER TABLE public.taxi_miles_vouchers ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;
CREATE TABLE IF NOT EXISTS public.taxi_miles_ledger (
 id uuid PRIMARY KEY,customer_id uuid NOT NULL REFERENCES public.customer_accounts(id),model text NOT NULL CHECK(model IN('native','autocab')),booking_id text NOT NULL,
 millimiles bigint NOT NULL CHECK(millimiles>0),completed_at timestamptz NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(booking_id)
);
CREATE INDEX IF NOT EXISTS taxi_miles_ledger_customer ON public.taxi_miles_ledger(customer_id,completed_at);
CREATE TABLE IF NOT EXISTS public.taxi_miles_redemptions (
 id uuid PRIMARY KEY,voucher_id uuid NOT NULL REFERENCES public.taxi_miles_vouchers(id),customer_id uuid NOT NULL REFERENCES public.customer_accounts(id),booking_id text NOT NULL,
 saving_pence integer NOT NULL CHECK(saving_pence>0),state text NOT NULL CHECK(state IN('reserved','consumed','released')),expires_at timestamptz NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(voucher_id,booking_id)
);
CREATE INDEX IF NOT EXISTS taxi_miles_redemption_limits ON public.taxi_miles_redemptions(voucher_id,state,expires_at);
CREATE TABLE IF NOT EXISTS public.taxi_miles_audit (
 id bigserial PRIMARY KEY,action text NOT NULL,entity_id text NOT NULL,details jsonb NOT NULL DEFAULT '{}',created_at timestamptz NOT NULL DEFAULT now()
);
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='needacabplus_shared_app') THEN
 GRANT SELECT,INSERT,UPDATE ON public.taxi_miles_configuration,public.taxi_miles_vouchers,public.taxi_miles_ledger,public.taxi_miles_redemptions,public.taxi_miles_audit TO needacabplus_shared_app;
 GRANT USAGE,SELECT ON SEQUENCE public.taxi_miles_audit_id_seq TO needacabplus_shared_app;
 END IF;
END $$;
