CREATE OR REPLACE FUNCTION award_completed_booking_loyalty() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE policy jsonb; membership_policy jsonb; booking_policy jsonb; ride_points numeric; distance_points numeric; miles numeric; awarded bigint;
BEGIN
 IF NEW.status<>'Completed' OR COALESCE(OLD.status,'')='Completed' OR NEW.user_id IS NULL OR NOT EXISTS(SELECT 1 FROM customer_accounts WHERE id::text=NEW.user_id) THEN RETURN NEW; END IF;
 SELECT settings->'liveQuotes'->'loyalty' INTO policy FROM operations_settings WHERE id='pricing';
 IF COALESCE((policy->>'enabled')::boolean,false)=false THEN RETURN NEW; END IF;
 SELECT settings->'liveQuotes'->'membership' INTO membership_policy FROM operations_settings WHERE id='pricing';
 SELECT settings INTO booking_policy FROM app_configuration WHERE section='bookings';
 IF COALESCE((booking_policy->>'loyaltyRequiresPaidMembership')::boolean,true) AND NOT EXISTS(
  SELECT 1 FROM customer_memberships m WHERE m.customer_id=NEW.user_id::uuid
   AND (m.status='active' OR (m.status='grace_period' AND COALESCE((membership_policy#>>'{dunning,keepBenefitsDuringGrace}')::boolean,false) AND m.grace_ends_at>now()))
   AND m.starts_at<=now() AND (m.ends_at IS NULL OR m.ends_at>now())
   AND COALESCE((membership_policy->>'enabled')::boolean,false)
   AND COALESCE((membership_policy#>>ARRAY['tiers',m.tier_id,'enabled'])::boolean,false)
   AND COALESCE((membership_policy#>>ARRAY['tiers',m.tier_id,'monthlyPrice'])::numeric,0)>0
 ) THEN RETURN NEW; END IF;
 ride_points:=COALESCE((policy->>'pointsPerCompletedRide')::numeric,0);
 distance_points:=COALESCE((policy->>'pointsPerMile')::numeric,0);
 BEGIN
  miles:=COALESCE(NULLIF(NEW.pricing_data->>'distanceMiles','')::numeric,NULLIF(NEW.pricing_data->>'mileage','')::numeric,NULLIF(NEW.raw_payload#>>'{pricing,distanceMiles}','')::numeric,0);
 EXCEPTION WHEN OTHERS THEN miles:=0; END;
 awarded:=GREATEST(0,FLOOR(ride_points+GREATEST(0,miles)*distance_points))::bigint;
 IF awarded=0 THEN RETURN NEW; END IF;
 INSERT INTO customer_loyalty_ledger(id,customer_id,booking_id,event_type,points,description,metadata)
 VALUES(md5('loyalty:ride:'||NEW.id::text)::uuid,NEW.user_id::uuid,NEW.id,'ride',awarded,'Completed journey',jsonb_build_object('distanceMiles',miles))
 ON CONFLICT DO NOTHING;
 IF FOUND THEN
  INSERT INTO customer_loyalty_accounts(customer_id,points_balance,lifetime_points) VALUES(NEW.user_id::uuid,awarded,awarded)
  ON CONFLICT(customer_id) DO UPDATE SET points_balance=customer_loyalty_accounts.points_balance+EXCLUDED.points_balance,lifetime_points=customer_loyalty_accounts.lifetime_points+EXCLUDED.lifetime_points,updated_at=now();
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS award_completed_booking_loyalty_trigger ON bookings;
CREATE TRIGGER award_completed_booking_loyalty_trigger AFTER UPDATE OF status ON bookings FOR EACH ROW EXECUTE FUNCTION award_completed_booking_loyalty();

