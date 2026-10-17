-- Apply before deploying membership test grants. Does not grant any access itself.
ALTER TABLE customer_memberships ADD COLUMN IF NOT EXISTS operator_access_until timestamptz;
ALTER TABLE customer_memberships ADD COLUMN IF NOT EXISTS operator_access_reason text;
