'use strict';

/**
 * migrate.js — One-time migration from JSON files to SQLite
 *
 * Reads:
 *   backend/data/sync-accounts.json  → accounts + profiles
 *   backend/data/sync-state/{id}.json → sync_state rows
 *
 * Run with: node backend/migrate.js
 * Idempotent: skips records that already exist in the DB.
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const DATA_DIR = path.join(__dirname, 'data');
const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, 'app.db');
const SYNC_ACCOUNTS_FILE = path.join(DATA_DIR, 'sync-accounts.json');
const SYNC_STATE_DIR = path.join(DATA_DIR, 'sync-state');

const db = require('./db.js');

function generateId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return crypto.randomBytes(16).toString('hex');
}

function normalizeEmail(displayName) {
  return String(displayName || '').trim().toLowerCase().replace(/\s+/g, '.').replace(/[^a-z0-9._-]/g, '') + '@local.migrated';
}

function safeAccountId(value = '') {
  const id = String(value).trim();
  return /^[a-zA-Z0-9_-]{1,120}$/.test(id) ? id : '';
}

function readSyncAccounts() {
  if (!fs.existsSync(SYNC_ACCOUNTS_FILE)) return [];
  try {
    const raw = fs.readFileSync(SYNC_ACCOUNTS_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    const accounts = Array.isArray(parsed) ? parsed : (Array.isArray(parsed.accounts) ? parsed.accounts : []);
    return accounts;
  } catch (e) {
    console.error('[migrate] Cannot read sync-accounts.json:', e.message);
    return [];
  }
}

function readSyncStateFile(accountId) {
  const safeId = safeAccountId(accountId);
  if (!safeId) return null;
  const file = path.join(SYNC_STATE_DIR, `${safeId}.json`);
  if (!fs.existsSync(file)) return null;
  try {
    const raw = fs.readFileSync(file, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed.state || parsed;
  } catch (e) {
    console.warn(`[migrate] Cannot read sync-state/${safeId}.json:`, e.message);
    return null;
  }
}

function main() {
  // Ensure data dir and DB
  fs.mkdirSync(DATA_DIR, { recursive: true });
  db.initDb(DB_PATH);

  const legacyAccounts = readSyncAccounts();
  console.log(`[migrate] Found ${legacyAccounts.length} legacy accounts.`);

  let accountsCreated = 0;
  let profilesCreated = 0;
  let statesMigrated = 0;
  let skipped = 0;

  for (const legacy of legacyAccounts) {
    const legacyId = String(legacy.id || '').trim();
    if (!legacyId) {
      console.warn('[migrate] Skipping account with no id:', legacy);
      continue;
    }

    const displayName = String(legacy.displayName || legacyId).trim();
    const email = normalizeEmail(displayName);

    // Check if already migrated (by email)
    const existing = db.getAccountByEmail(email);
    if (existing) {
      console.log(`[migrate] Account ${email} already exists — skipping.`);
      skipped++;

      // Still try to migrate sync state if not already done
      const profileId = `default-${legacyId}`;
      const stateRow = db.getSyncState(existing.id, profileId);
      if (!stateRow) {
        const stateData = readSyncStateFile(legacyId);
        if (stateData) {
          db.upsertSyncState(existing.id, profileId, stateData);
          statesMigrated++;
          console.log(`[migrate] Migrated sync state for existing account ${email} / profile ${profileId}.`);
        }
      }
      continue;
    }

    // Create account — reuse legacy password hash if available
    const accountId = generateId();
    const now = legacy.createdAt || new Date().toISOString();

    let salt, hash, algorithm;
    if (legacy.password && legacy.password.salt && legacy.password.hash) {
      salt = legacy.password.salt;
      hash = legacy.password.hash;
      // Detect algorithm: if hash is 8 hex chars it's fallback-hash
      algorithm = legacy.password.algorithm === 'pbkdf2-sha256' ? 'pbkdf2' : 'fallback-hash';
    } else {
      // No password available — set a random unusable hash
      salt = crypto.randomBytes(16).toString('hex');
      hash = crypto.randomBytes(32).toString('hex');
      algorithm = 'pbkdf2';
    }

    db.createAccount({
      id: accountId,
      email,
      algorithm,
      salt,
      hash,
      iterations: legacy.password?.iterations || 1,
      createdAt: now,
    });
    accountsCreated++;
    console.log(`[migrate] Created account: ${email} (id=${accountId})`);

    // Create default profile
    const profileId = generateId();
    db.createProfile({
      id: profileId,
      accountId,
      username: displayName.slice(0, 80),
      algorithm,
      salt,
      hash,
      iterations: legacy.password?.iterations || 1,
      currency: 'EUR',
      locale: 'it-IT',
      storageKey: legacy.storageKey || `finanza:profile:${accountId}:${profileId}`,
      isDefault: true,
      createdAt: now,
    });
    profilesCreated++;
    console.log(`[migrate] Created default profile: ${displayName} (id=${profileId})`);

    // Migrate sync state
    const legacySyncProfileId = `default-${legacyId}`;
    const stateData = readSyncStateFile(legacyId);
    if (stateData) {
      db.upsertSyncState(accountId, legacySyncProfileId, stateData);
      statesMigrated++;
      console.log(`[migrate] Migrated sync state for account ${email}.`);
    }
  }

  console.log('\n[migrate] Done.');
  console.log(`  Accounts created:   ${accountsCreated}`);
  console.log(`  Profiles created:   ${profilesCreated}`);
  console.log(`  States migrated:    ${statesMigrated}`);
  console.log(`  Already existing:   ${skipped}`);
}

main();
