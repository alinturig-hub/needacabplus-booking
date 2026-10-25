ALTER TABLE public.app_configuration DROP CONSTRAINT IF EXISTS app_configuration_section_check;
ALTER TABLE public.app_configuration ADD CONSTRAINT app_configuration_section_check CHECK(section IN('bookings','bookings_native','sms','identity'));
-- Seed once from the formerly shared policy, preserving native No Fare cash behavior.
-- Later changes to either model must never overwrite the other model.
INSERT INTO public.app_configuration(section,settings,secrets_encrypted)
SELECT 'bookings_native',COALESCE(jsonb_object_agg(key,value) FILTER(WHERE key IN('cashEnabled','cardEnabled','paymentMethod','priorityDelayMinutes','minPrebookMinutes','priorityRequiresPaidMembership','guaranteeRequiresPaidMembership','loyaltyRequiresPaidMembership')),'{}'::jsonb)||'{"liveBookingsEnabled":false}'::jsonb,''
FROM jsonb_each(COALESCE((SELECT settings FROM public.app_configuration WHERE section='bookings'),'{}'::jsonb))
ON CONFLICT(section) DO NOTHING;
