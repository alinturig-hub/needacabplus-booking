CREATE TABLE IF NOT EXISTS public."BookingPostCommitEffect" (
  "webhookEventId" text PRIMARY KEY REFERENCES public."WebhookEvent"(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','PROCESSING','DONE')),
  "attemptCount" integer NOT NULL DEFAULT 0,
  "nextAttemptAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "leaseUntil" timestamp(3),
  "processedAt" timestamp(3),
  "lastError" text,
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "BookingPostCommitEffect_status_nextAttemptAt_idx"
  ON public."BookingPostCommitEffect"(status,"nextAttemptAt");

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='needacabplus_shared_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON public."BookingPostCommitEffect" TO needacabplus_shared_app;
  END IF;
END $$;
