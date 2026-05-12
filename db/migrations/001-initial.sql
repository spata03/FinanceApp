-- 001-initial.sql
-- Initial schema for FinanzaPersonale on Postgres (Neon).
-- Idempotent: uses CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS accounts (
  id                   TEXT PRIMARY KEY,
  email                TEXT UNIQUE NOT NULL,
  password_algorithm   TEXT NOT NULL DEFAULT 'pbkdf2',
  password_salt        TEXT NOT NULL,
  password_hash        TEXT NOT NULL,
  password_iterations  INTEGER NOT NULL DEFAULT 120000,
  created_at           TEXT NOT NULL,
  last_login_at        TEXT,
  last_profile_id      TEXT
);

CREATE TABLE IF NOT EXISTS profiles (
  id                   TEXT PRIMARY KEY,
  account_id           TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  username             TEXT NOT NULL,
  password_algorithm   TEXT NOT NULL DEFAULT 'pbkdf2',
  password_salt        TEXT NOT NULL,
  password_hash        TEXT NOT NULL,
  password_iterations  INTEGER NOT NULL DEFAULT 120000,
  currency             TEXT NOT NULL DEFAULT 'EUR',
  locale               TEXT NOT NULL DEFAULT 'it-IT',
  storage_key          TEXT NOT NULL,
  is_default           INTEGER NOT NULL DEFAULT 0,
  created_at           TEXT NOT NULL,
  synced_at            TEXT,
  UNIQUE(account_id, username)
);

-- accounts.last_profile_id references profiles(id) but we add the FK after
-- profiles is created. ON DELETE SET NULL keeps account intact if profile deleted.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'accounts_last_profile_id_fkey'
      AND table_name = 'accounts'
  ) THEN
    ALTER TABLE accounts
      ADD CONSTRAINT accounts_last_profile_id_fkey
      FOREIGN KEY (last_profile_id) REFERENCES profiles(id) ON DELETE SET NULL;
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS sessions (
  id                TEXT PRIMARY KEY,
  account_id        TEXT REFERENCES accounts(id) ON DELETE SET NULL,
  profile_id        TEXT REFERENCES profiles(id) ON DELETE SET NULL,
  csrf_token        TEXT,
  csrf_expires_at   BIGINT,
  created_at        BIGINT NOT NULL,
  last_seen_at      BIGINT NOT NULL,
  expires_at        BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS sync_state (
  account_id  TEXT NOT NULL,
  profile_id  TEXT NOT NULL,
  state_json  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  size_bytes  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (account_id, profile_id)
);

CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_profiles_account ON profiles(account_id);
