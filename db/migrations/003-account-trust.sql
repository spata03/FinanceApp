-- 003-account-trust.sql
-- Promotes the device_trust table to support account-level trust tokens in
-- addition to the existing per-profile tokens. An account-level row is stored
-- with profile_id = NULL and lets the holder unlock ANY profile of the same
-- account on this device without retyping the profile password.
--
-- Idempotent: ALTER COLUMN ... DROP NOT NULL is a no-op if already nullable.

ALTER TABLE device_trust ALTER COLUMN profile_id DROP NOT NULL;
