'use strict';

/**
 * db.js - SQLite persistence layer for FinanzaPersonale
 *
 * Uses better-sqlite3 (synchronous API — no async/await).
 * All functions exported here replace the old JSON-file persistence.
 */

const crypto = require('node:crypto');
const path = require('node:path');
const fs = require('node:fs');

let Database;
try {
  Database = require('better-sqlite3');
} catch (e) {
  // Allow the module to be required without better-sqlite3 installed
  // (will throw at initDb time).
  Database = null;
}

/** @type {import('better-sqlite3').Database | null} */
let db = null;

// ── Schema ─────────────────────────────────────────────────────────────────────

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_algorithm TEXT NOT NULL DEFAULT 'pbkdf2',
  password_salt TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  password_iterations INTEGER NOT NULL DEFAULT 120000,
  created_at TEXT NOT NULL,
  last_login_at TEXT
);

CREATE TABLE IF NOT EXISTS profiles (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  username TEXT NOT NULL,
  password_algorithm TEXT NOT NULL DEFAULT 'pbkdf2',
  password_salt TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  password_iterations INTEGER NOT NULL DEFAULT 120000,
  currency TEXT NOT NULL DEFAULT 'EUR',
  locale TEXT NOT NULL DEFAULT 'it-IT',
  storage_key TEXT NOT NULL,
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  synced_at TEXT,
  UNIQUE(account_id, username)
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  account_id TEXT REFERENCES accounts(id) ON DELETE SET NULL,
  profile_id TEXT REFERENCES profiles(id) ON DELETE SET NULL,
  csrf_token TEXT,
  csrf_expires_at INTEGER,
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sync_state (
  account_id TEXT NOT NULL,
  profile_id TEXT NOT NULL,
  state_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (account_id, profile_id)
);

CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_profiles_account ON profiles(account_id);
`;

// ── Crypto helpers ─────────────────────────────────────────────────────────────

const PBKDF2_ITERATIONS = 120000;
const PBKDF2_KEYLEN = 32;
const PBKDF2_DIGEST = 'sha256';
const CSRF_TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours — survives cold starts

/**
 * Generate a random hex salt (32 hex chars = 16 bytes).
 */
function generateSalt() {
  return crypto.randomBytes(16).toString('hex');
}

/**
 * Hash a password using pbkdf2 (sync).
 * Falls back to FNV-1a if algorithm === 'fallback-hash'.
 */
function hashPassword(password, salt, algorithm, iterations) {
  const algo = algorithm || 'pbkdf2';
  if (algo === 'pbkdf2') {
    return crypto
      .pbkdf2Sync(String(password), salt, iterations || PBKDF2_ITERATIONS, PBKDF2_KEYLEN, PBKDF2_DIGEST)
      .toString('hex');
  }
  // fallback-hash: FNV-1a 32-bit (legacy compatibility)
  let h = 2166136261;
  const combined = String(password) + String(salt);
  for (let i = 0; i < combined.length; i++) {
    h ^= combined.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

// ── Init ───────────────────────────────────────────────────────────────────────

/**
 * Open (or create) the SQLite database and apply the schema.
 * Must be called once at server boot before any other db.* function.
 * @param {string} dbPath - Absolute path to the .db file.
 */
function initDb(dbPath) {
  if (!Database) {
    throw new Error('better-sqlite3 not installed. Run: npm install');
  }

  // Ensure parent directory exists
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  db = new Database(dbPath);

  // Performance / safety pragmas
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('synchronous = NORMAL');

  // Apply schema
  db.exec(SCHEMA_SQL);

  console.log(`[DB] Initialized at ${dbPath}`);
  return db;
}

function getDb() {
  if (!db) throw new Error('Database not initialized. Call initDb() first.');
  return db;
}

// ── Sessions ───────────────────────────────────────────────────────────────────

/**
 * Fetch a session by id. Returns null if not found or expired.
 */
function getSession(id) {
  const row = getDb().prepare('SELECT * FROM sessions WHERE id = ?').get(id);
  if (!row) return null;
  if (row.expires_at < Date.now()) {
    getDb().prepare('DELETE FROM sessions WHERE id = ?').run(id);
    return null;
  }
  return row;
}

/**
 * Create a new session record.
 * @param {{ id: string, account_id?: string, profile_id?: string, expires_at: number }} data
 */
function createSession(data) {
  const now = Date.now();
  getDb().prepare(`
    INSERT INTO sessions (id, account_id, profile_id, csrf_token, csrf_expires_at, created_at, last_seen_at, expires_at)
    VALUES (?, ?, ?, NULL, NULL, ?, ?, ?)
  `).run(
    data.id,
    data.account_id || null,
    data.profile_id || null,
    now,
    now,
    data.expires_at || now + 30 * 24 * 60 * 60 * 1000,
  );
  return getSession(data.id);
}

/**
 * Update mutable fields on a session.
 * @param {string} id
 * @param {{ account_id?: string, profile_id?: string }} data
 */
function updateSession(id, data) {
  const fields = [];
  const values = [];

  if (Object.prototype.hasOwnProperty.call(data, 'account_id')) {
    fields.push('account_id = ?');
    values.push(data.account_id || null);
  }
  if (Object.prototype.hasOwnProperty.call(data, 'profile_id')) {
    fields.push('profile_id = ?');
    values.push(data.profile_id || null);
  }

  if (fields.length === 0) return getSession(id);

  values.push(id);
  getDb().prepare(`UPDATE sessions SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  return getSession(id);
}

/**
 * Update last_seen_at for a session (lightweight heartbeat).
 */
function updateSessionLastSeen(id) {
  getDb().prepare('UPDATE sessions SET last_seen_at = ? WHERE id = ?').run(Date.now(), id);
}

/**
 * Delete a session (logout).
 */
function deleteSession(id) {
  getDb().prepare('DELETE FROM sessions WHERE id = ?').run(id);
}

/**
 * Remove all sessions past their expires_at.
 */
function cleanExpiredSessions() {
  const info = getDb().prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());
  return info.changes;
}

// ── CSRF ───────────────────────────────────────────────────────────────────────

/**
 * Generate (or overwrite) the CSRF token stored in the session row.
 * Survives server restarts because it's persisted in SQLite.
 * @returns {string} The new token.
 */
function generateCsrfToken(sessionId) {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = Date.now() + CSRF_TOKEN_TTL_MS;
  getDb().prepare(`
    UPDATE sessions SET csrf_token = ?, csrf_expires_at = ? WHERE id = ?
  `).run(token, expiresAt, sessionId);
  return token;
}

/**
 * Validate the CSRF token for a session.
 * @returns {boolean}
 */
function validateCsrfToken(sessionId, token) {
  if (!token) return false;
  const row = getDb().prepare(
    'SELECT csrf_token, csrf_expires_at FROM sessions WHERE id = ?'
  ).get(sessionId);
  if (!row || !row.csrf_token) return false;
  if (row.csrf_expires_at && Date.now() > row.csrf_expires_at) return false;
  // Constant-time comparison
  const a = Buffer.from(String(token));
  const b = Buffer.from(String(row.csrf_token));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/**
 * Rotate the CSRF token (alias for generateCsrfToken — kept for clarity).
 */
function rotateCsrfToken(sessionId) {
  return generateCsrfToken(sessionId);
}

// ── Accounts ───────────────────────────────────────────────────────────────────

function rowToAccount(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    passwordAlgorithm: row.password_algorithm,
    passwordSalt: row.password_salt,
    passwordHash: row.password_hash,
    passwordIterations: row.password_iterations,
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at || null,
  };
}

function getAccount(id) {
  return rowToAccount(getDb().prepare('SELECT * FROM accounts WHERE id = ?').get(id));
}

function getAccountByEmail(email) {
  return rowToAccount(
    getDb().prepare('SELECT * FROM accounts WHERE email = ?').get(String(email).toLowerCase().trim())
  );
}

/**
 * Create an account.
 * @param {{ id: string, email: string, password: string, algorithm?: string, salt?: string, hash?: string, iterations?: number, createdAt?: string }} data
 */
function createAccount(data) {
  const now = data.createdAt || new Date().toISOString();
  const salt = data.salt || generateSalt();
  const algorithm = data.algorithm || 'pbkdf2';
  const iterations = data.iterations || PBKDF2_ITERATIONS;
  const hash = data.hash || hashPassword(data.password, salt, algorithm, iterations);

  getDb().prepare(`
    INSERT INTO accounts (id, email, password_algorithm, password_salt, password_hash, password_iterations, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(data.id, String(data.email).toLowerCase().trim(), algorithm, salt, hash, iterations, now);

  return getAccount(data.id);
}

/**
 * Update mutable account fields.
 */
function updateAccount(id, data) {
  if (data.lastLoginAt !== undefined) {
    getDb().prepare('UPDATE accounts SET last_login_at = ? WHERE id = ?').run(data.lastLoginAt, id);
  }
  if (data.email !== undefined) {
    getDb().prepare('UPDATE accounts SET email = ? WHERE id = ?').run(
      String(data.email).toLowerCase().trim(), id
    );
  }
  return getAccount(id);
}

// ── Profiles ───────────────────────────────────────────────────────────────────

function rowToProfile(row) {
  if (!row) return null;
  return {
    id: row.id,
    accountId: row.account_id,
    username: row.username,
    passwordAlgorithm: row.password_algorithm,
    passwordSalt: row.password_salt,
    passwordHash: row.password_hash,
    passwordIterations: row.password_iterations,
    currency: row.currency,
    locale: row.locale,
    storageKey: row.storage_key,
    isDefault: Boolean(row.is_default),
    createdAt: row.created_at,
    syncedAt: row.synced_at || null,
  };
}

function getProfile(id) {
  return rowToProfile(getDb().prepare('SELECT * FROM profiles WHERE id = ?').get(id));
}

function getProfilesByAccount(accountId) {
  return getDb()
    .prepare('SELECT * FROM profiles WHERE account_id = ? ORDER BY is_default DESC, created_at ASC')
    .all(accountId)
    .map(rowToProfile);
}

/**
 * Create a profile.
 * @param {{ id: string, accountId: string, username: string, password: string, currency?: string, locale?: string, storageKey: string, isDefault?: boolean, algorithm?: string, salt?: string, hash?: string, iterations?: number, createdAt?: string }} data
 */
function createProfile(data) {
  const now = data.createdAt || new Date().toISOString();
  const salt = data.salt || generateSalt();
  const algorithm = data.algorithm || 'pbkdf2';
  const iterations = data.iterations || PBKDF2_ITERATIONS;
  const hash = data.hash || hashPassword(data.password, salt, algorithm, iterations);

  getDb().prepare(`
    INSERT INTO profiles
      (id, account_id, username, password_algorithm, password_salt, password_hash, password_iterations,
       currency, locale, storage_key, is_default, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    data.id,
    data.accountId,
    String(data.username).trim(),
    algorithm,
    salt,
    hash,
    iterations,
    data.currency || 'EUR',
    data.locale || 'it-IT',
    data.storageKey,
    data.isDefault ? 1 : 0,
    now,
  );

  return getProfile(data.id);
}

function updateProfile(id, data) {
  if (data.syncedAt !== undefined) {
    getDb().prepare('UPDATE profiles SET synced_at = ? WHERE id = ?').run(data.syncedAt, id);
  }
  if (data.currency !== undefined) {
    getDb().prepare('UPDATE profiles SET currency = ? WHERE id = ?').run(data.currency, id);
  }
  if (data.locale !== undefined) {
    getDb().prepare('UPDATE profiles SET locale = ? WHERE id = ?').run(data.locale, id);
  }
  return getProfile(id);
}

function deleteProfile(id) {
  // sync_state rows are deleted by ON DELETE CASCADE on profile_id if we add FK,
  // but sync_state has no FK constraint — delete manually.
  const profile = getProfile(id);
  if (profile) {
    getDb().prepare('DELETE FROM sync_state WHERE account_id = ? AND profile_id = ?').run(profile.accountId, id);
  }
  getDb().prepare('DELETE FROM profiles WHERE id = ?').run(id);
}

/**
 * Set the given profile as default for the account (clears others).
 */
function setDefaultProfile(accountId, profileId) {
  getDb().transaction(() => {
    getDb().prepare('UPDATE profiles SET is_default = 0 WHERE account_id = ?').run(accountId);
    getDb().prepare('UPDATE profiles SET is_default = 1 WHERE id = ? AND account_id = ?').run(profileId, accountId);
  })();
}

// ── Sync state ─────────────────────────────────────────────────────────────────

function getSyncState(accountId, profileId) {
  const row = getDb().prepare(
    'SELECT * FROM sync_state WHERE account_id = ? AND profile_id = ?'
  ).get(accountId, profileId);
  if (!row) return null;
  try {
    return {
      accountId: row.account_id,
      profileId: row.profile_id,
      state: JSON.parse(row.state_json),
      updatedAt: row.updated_at,
      sizeBytes: row.size_bytes,
    };
  } catch (e) {
    return null;
  }
}

/**
 * Insert or replace the sync state for an account+profile pair.
 * @param {string} accountId
 * @param {string} profileId
 * @param {object|string} stateJson - The state object (will be JSON-stringified if needed).
 */
function upsertSyncState(accountId, profileId, stateJson) {
  const json = typeof stateJson === 'string' ? stateJson : JSON.stringify(stateJson);
  const sizeBytes = Buffer.byteLength(json, 'utf8');
  const updatedAt = new Date().toISOString();
  getDb().prepare(`
    INSERT INTO sync_state (account_id, profile_id, state_json, updated_at, size_bytes)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(account_id, profile_id) DO UPDATE SET
      state_json = excluded.state_json,
      updated_at = excluded.updated_at,
      size_bytes = excluded.size_bytes
  `).run(accountId, profileId, json, updatedAt, sizeBytes);
}

function deleteSyncState(accountId, profileId) {
  getDb().prepare('DELETE FROM sync_state WHERE account_id = ? AND profile_id = ?').run(accountId, profileId);
}

// ── Password verification (exported for use in server.js) ─────────────────────

/**
 * Verify a plaintext password against a stored account/profile row.
 * @param {string} password
 * @param {{ passwordAlgorithm: string, passwordSalt: string, passwordHash: string, passwordIterations: number }} record
 * @returns {boolean}
 */
function verifyPassword(password, record) {
  if (!record || !record.passwordSalt || !record.passwordHash) return false;
  const computed = hashPassword(password, record.passwordSalt, record.passwordAlgorithm, record.passwordIterations);
  const a = Buffer.from(String(computed));
  const b = Buffer.from(String(record.passwordHash));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// ── Exports ────────────────────────────────────────────────────────────────────

module.exports = {
  initDb,
  // sessions
  getSession,
  createSession,
  updateSession,
  updateSessionLastSeen,
  deleteSession,
  cleanExpiredSessions,
  // CSRF
  generateCsrfToken,
  validateCsrfToken,
  rotateCsrfToken,
  // accounts
  getAccount,
  getAccountByEmail,
  createAccount,
  updateAccount,
  // profiles
  getProfile,
  getProfilesByAccount,
  createProfile,
  updateProfile,
  deleteProfile,
  setDefaultProfile,
  // sync state
  getSyncState,
  upsertSyncState,
  deleteSyncState,
  // password helpers
  generateSalt,
  hashPassword,
  verifyPassword,
};
