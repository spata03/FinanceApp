-- 002-device-trust.sql
-- Adds "trusted device" tokens for skipping profile password re-prompts
-- after the user has authenticated once on a given device.
-- Idempotent: uses CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS device_trust (
  id            TEXT PRIMARY KEY,
  account_id    TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  profile_id    TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  token_hash    TEXT NOT NULL,
  created_at    BIGINT NOT NULL,
  last_used_at  BIGINT,
  expires_at    BIGINT,
  revoked_at    BIGINT
);

CREATE INDEX IF NOT EXISTS idx_device_trust_account_profile
  ON device_trust(account_id, profile_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_device_trust_token_hash
  ON device_trust(token_hash);
