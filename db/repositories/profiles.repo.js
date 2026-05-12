/**
 * profiles.repo.js — Profile persistence (Postgres / Neon).
 */

import { getSql } from '../client.js';
import { generateSalt, hashPassword } from './accounts.repo.js';

const PBKDF2_ITERATIONS = 120000;

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

export async function getProfile(id) {
  const sql = getSql();
  const rows = await sql`SELECT * FROM profiles WHERE id = ${id}`;
  return rowToProfile(rows[0]);
}

export async function getProfilesByAccount(accountId) {
  const sql = getSql();
  const rows = await sql`
    SELECT * FROM profiles
    WHERE account_id = ${accountId}
    ORDER BY is_default DESC, created_at ASC
  `;
  return rows.map(rowToProfile);
}

export async function createProfile(data) {
  const sql = getSql();
  const now = data.createdAt || new Date().toISOString();
  const salt = data.salt || generateSalt();
  const algorithm = data.algorithm || 'pbkdf2';
  const iterations = data.iterations || PBKDF2_ITERATIONS;
  const hash = data.hash || hashPassword(data.password, salt, algorithm, iterations);

  try {
    await sql`
      INSERT INTO profiles
        (id, account_id, username, password_algorithm, password_salt, password_hash, password_iterations,
         currency, locale, storage_key, is_default, created_at)
      VALUES (
        ${data.id}, ${data.accountId}, ${String(data.username).trim()},
        ${algorithm}, ${salt}, ${hash}, ${iterations},
        ${data.currency || 'EUR'}, ${data.locale || 'it-IT'},
        ${data.storageKey}, ${data.isDefault ? 1 : 0}, ${now}
      )
    `;
  } catch (err) {
    // Surface UNIQUE violations as a normal error with a recognizable substring
    const msg = String(err && err.message || err);
    if (/unique/i.test(msg) || err?.code === '23505') {
      const e = new Error('UNIQUE constraint failed on (account_id, username).');
      e.code = '23505';
      throw e;
    }
    throw err;
  }
  return getProfile(data.id);
}

export async function updateProfile(id, data) {
  const sql = getSql();
  if (data.syncedAt !== undefined) {
    await sql`UPDATE profiles SET synced_at = ${data.syncedAt} WHERE id = ${id}`;
  }
  if (data.currency !== undefined) {
    await sql`UPDATE profiles SET currency = ${data.currency} WHERE id = ${id}`;
  }
  if (data.locale !== undefined) {
    await sql`UPDATE profiles SET locale = ${data.locale} WHERE id = ${id}`;
  }
  return getProfile(id);
}

export async function deleteProfile(id) {
  const sql = getSql();
  const profile = await getProfile(id);
  if (profile) {
    await sql`DELETE FROM sync_state WHERE account_id = ${profile.accountId} AND profile_id = ${id}`;
  }
  await sql`DELETE FROM profiles WHERE id = ${id}`;
}

export async function setDefaultProfile(accountId, profileId) {
  const sql = getSql();
  await sql`UPDATE profiles SET is_default = 0 WHERE account_id = ${accountId}`;
  await sql`UPDATE profiles SET is_default = 1 WHERE id = ${profileId} AND account_id = ${accountId}`;
}
