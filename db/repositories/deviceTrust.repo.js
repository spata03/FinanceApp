/**
 * deviceTrust.repo.js — Trusted device tokens (Postgres / Neon).
 *
 * Each row represents a single device that has authenticated against a given
 * (account_id, profile_id) pair. The raw token is never stored: we keep only
 * its SHA-256 hash so a database leak does not reveal usable credentials.
 */

import { getSql } from '../client.js';

function rowToTrust(row) {
  if (!row) return null;
  return {
    id: row.id,
    accountId: row.account_id,
    profileId: row.profile_id,
    tokenHash: row.token_hash,
    createdAt: row.created_at != null ? Number(row.created_at) : null,
    lastUsedAt: row.last_used_at != null ? Number(row.last_used_at) : null,
    expiresAt: row.expires_at != null ? Number(row.expires_at) : null,
    revokedAt: row.revoked_at != null ? Number(row.revoked_at) : null,
  };
}

export async function createTrust({ id, accountId, profileId, tokenHash, expiresAtMs }) {
  const sql = getSql();
  const now = Date.now();
  const expiresAt = expiresAtMs ?? null;
  await sql`
    INSERT INTO device_trust (id, account_id, profile_id, token_hash, created_at, last_used_at, expires_at, revoked_at)
    VALUES (${id}, ${accountId}, ${profileId}, ${tokenHash}, ${now}, ${now}, ${expiresAt}, NULL)
  `;
}

/**
 * Look up an active (not revoked, not expired) trust row matching the supplied
 * accountId / profileId / tokenHash.
 */
export async function findActiveTrust({ accountId, profileId, tokenHash }) {
  const sql = getSql();
  const now = Date.now();
  const rows = await sql`
    SELECT * FROM device_trust
    WHERE account_id = ${accountId}
      AND profile_id = ${profileId}
      AND token_hash = ${tokenHash}
      AND revoked_at IS NULL
      AND (expires_at IS NULL OR expires_at > ${now})
    LIMIT 1
  `;
  return rowToTrust(rows[0]);
}

export async function touchTrust(id) {
  const sql = getSql();
  await sql`UPDATE device_trust SET last_used_at = ${Date.now()} WHERE id = ${id}`;
}

export async function revokeTrust(id) {
  const sql = getSql();
  await sql`UPDATE device_trust SET revoked_at = ${Date.now()} WHERE id = ${id} AND revoked_at IS NULL`;
}

export async function revokeTrustsByProfile(profileId) {
  const sql = getSql();
  await sql`UPDATE device_trust SET revoked_at = ${Date.now()} WHERE profile_id = ${profileId} AND revoked_at IS NULL`;
}

export async function revokeTrustsByAccount(accountId) {
  const sql = getSql();
  await sql`UPDATE device_trust SET revoked_at = ${Date.now()} WHERE account_id = ${accountId} AND revoked_at IS NULL`;
}
