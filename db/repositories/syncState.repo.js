/**
 * syncState.repo.js — Per-(account, profile) JSON state blob.
 */

import { getSql } from '../client.js';

export async function getSyncState(accountId, profileId) {
  const sql = getSql();
  const rows = await sql`
    SELECT * FROM sync_state
    WHERE account_id = ${accountId} AND profile_id = ${profileId}
  `;
  const row = rows[0];
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

export async function upsertSyncState(accountId, profileId, stateJson) {
  const sql = getSql();
  const json = typeof stateJson === 'string' ? stateJson : JSON.stringify(stateJson);
  const sizeBytes = Buffer.byteLength(json, 'utf8');
  const updatedAt = new Date().toISOString();
  await sql`
    INSERT INTO sync_state (account_id, profile_id, state_json, updated_at, size_bytes)
    VALUES (${accountId}, ${profileId}, ${json}, ${updatedAt}, ${sizeBytes})
    ON CONFLICT (account_id, profile_id) DO UPDATE SET
      state_json = EXCLUDED.state_json,
      updated_at = EXCLUDED.updated_at,
      size_bytes = EXCLUDED.size_bytes
  `;
}

export async function deleteSyncState(accountId, profileId) {
  const sql = getSql();
  await sql`DELETE FROM sync_state WHERE account_id = ${accountId} AND profile_id = ${profileId}`;
}
