-- Offline migration proposal. Never apply automatically at application startup.
BEGIN;
CREATE TABLE marketing_campaign_control (
 tenant_id text NOT NULL, campaign_id uuid NOT NULL REFERENCES marketing_campaigns(id),
 approved_by text NOT NULL, approved_at timestamptz NOT NULL, approved_version integer NOT NULL CHECK(approved_version>0),
 budget_pence bigint NOT NULL CHECK(budget_pence>=0), committed_pence bigint NOT NULL DEFAULT 0 CHECK(committed_pence>=0),
 reserved_pence bigint NOT NULL DEFAULT 0 CHECK(reserved_pence>=0),
 PRIMARY KEY(tenant_id,campaign_id), CHECK(committed_pence+reserved_pence<=budget_pence)
);
CREATE TABLE marketing_benefit_grants (
 tenant_id text NOT NULL,campaign_id uuid NOT NULL, benefit_id uuid NOT NULL,customer_id uuid NOT NULL,
 identity_verified boolean NOT NULL DEFAULT false,status text NOT NULL CHECK(status IN('pending','active','revoked','expired')),
 starts_at timestamptz NOT NULL,ends_at timestamptz NOT NULL,maximum_uses integer NOT NULL CHECK(maximum_uses>0),
 committed_uses integer NOT NULL DEFAULT 0 CHECK(committed_uses>=0),reserved_uses integer NOT NULL DEFAULT 0 CHECK(reserved_uses>=0),
 PRIMARY KEY(tenant_id,benefit_id), FOREIGN KEY(tenant_id,campaign_id) REFERENCES marketing_campaign_control(tenant_id,campaign_id),
 CHECK(ends_at>starts_at), CHECK(committed_uses+reserved_uses<=maximum_uses)
);
CREATE TABLE marketing_benefit_reservations (
 tenant_id text NOT NULL,reservation_id uuid NOT NULL,benefit_id uuid NOT NULL,operation_key text NOT NULL,
 channel text NOT NULL CHECK(channel IN('AUTOCAB','NEEDACABPLUS')),booking_ref text NOT NULL,
 amount_pence bigint NOT NULL CHECK(amount_pence>0),status text NOT NULL CHECK(status IN('reserved','committed','released')),
 created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(tenant_id,reservation_id),UNIQUE(tenant_id,operation_key),
 UNIQUE(tenant_id,benefit_id,channel,booking_ref),FOREIGN KEY(tenant_id,benefit_id) REFERENCES marketing_benefit_grants(tenant_id,benefit_id)
);
CREATE TABLE marketing_benefit_audit (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,tenant_id text NOT NULL,reservation_id uuid NOT NULL,
 event text NOT NULL,occurred_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(tenant_id,reservation_id) REFERENCES marketing_benefit_reservations(tenant_id,reservation_id)
);
CREATE FUNCTION reserve_marketing_benefit(t text,b uuid,r uuid,k text,ch text,ref text,amount bigint) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE g marketing_benefit_grants; existing marketing_benefit_reservations; c marketing_campaign_control;
BEGIN
 -- Grant lock serializes use counts across both channels; campaign lock serializes budget.
 SELECT * INTO g FROM marketing_benefit_grants WHERE tenant_id=t AND benefit_id=b FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'BENEFIT_NOT_FOUND'; END IF;
 SELECT * INTO existing FROM marketing_benefit_reservations WHERE tenant_id=t AND operation_key=k;
 IF FOUND THEN
 IF existing.benefit_id<>b OR existing.channel<>ch OR existing.booking_ref<>ref OR existing.amount_pence<>amount THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT';END IF;
 RETURN existing.reservation_id;
 END IF;
 IF NOT g.identity_verified OR g.status<>'active' OR now()<g.starts_at OR now()>=g.ends_at THEN RAISE EXCEPTION 'BENEFIT_NOT_ELIGIBLE';END IF;
 IF g.reserved_uses+g.committed_uses>=g.maximum_uses THEN RAISE EXCEPTION 'USAGE_LIMIT';END IF;
 SELECT * INTO c FROM marketing_campaign_control WHERE tenant_id=t AND campaign_id=g.campaign_id FOR UPDATE;
 IF amount<=0 OR amount>c.budget_pence-c.reserved_pence-c.committed_pence THEN RAISE EXCEPTION 'BUDGET_LIMIT'; END IF;
 INSERT INTO marketing_benefit_reservations VALUES(t,r,b,k,ch,ref,amount,'reserved',now());
 UPDATE marketing_benefit_grants SET reserved_uses=reserved_uses+1 WHERE tenant_id=t AND benefit_id=b;
 UPDATE marketing_campaign_control SET reserved_pence=reserved_pence+amount WHERE tenant_id=t AND campaign_id=g.campaign_id;
 INSERT INTO marketing_benefit_audit(tenant_id,reservation_id,event) VALUES(t,r,'reserved');
 RETURN r;
END $$;
-- Application service must verify tenant credentials and commercial price before
-- invoking these functions. No application role grants are made by this proposal.
REVOKE ALL ON FUNCTION reserve_marketing_benefit(text,uuid,uuid,text,text,text,bigint) FROM PUBLIC;
CREATE FUNCTION settle_marketing_benefit(t text,r uuid,outcome text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE v marketing_benefit_reservations; g marketing_benefit_grants;
BEGIN
 IF outcome NOT IN('committed','released') THEN RAISE EXCEPTION 'INVALID_OUTCOME';END IF;
 SELECT * INTO v FROM marketing_benefit_reservations WHERE tenant_id=t AND reservation_id=r;
 IF NOT FOUND THEN RAISE EXCEPTION 'RESERVATION_NOT_FOUND';END IF;
 SELECT * INTO g FROM marketing_benefit_grants WHERE tenant_id=t AND benefit_id=v.benefit_id FOR UPDATE;
 PERFORM 1 FROM marketing_campaign_control WHERE tenant_id=t AND campaign_id=g.campaign_id FOR UPDATE;
 SELECT * INTO v FROM marketing_benefit_reservations WHERE tenant_id=t AND reservation_id=r FOR UPDATE;
 IF v.status=outcome THEN RETURN outcome;END IF;
 IF v.status<>'reserved' THEN RAISE EXCEPTION 'TERMINAL_RESERVATION';END IF;
 UPDATE marketing_benefit_reservations SET status=outcome WHERE tenant_id=t AND reservation_id=r;
 UPDATE marketing_benefit_grants SET reserved_uses=reserved_uses-1,committed_uses=committed_uses+CASE WHEN outcome='committed' THEN 1 ELSE 0 END WHERE tenant_id=t AND benefit_id=g.benefit_id;
 UPDATE marketing_campaign_control SET reserved_pence=reserved_pence-v.amount_pence,committed_pence=committed_pence+CASE WHEN outcome='committed' THEN v.amount_pence ELSE 0 END WHERE tenant_id=t AND campaign_id=g.campaign_id;
 INSERT INTO marketing_benefit_audit(tenant_id,reservation_id,event) VALUES(t,r,outcome);RETURN outcome;
END $$;
REVOKE ALL ON FUNCTION settle_marketing_benefit(text,uuid,text) FROM PUBLIC;
COMMIT;
