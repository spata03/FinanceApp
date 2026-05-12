/**
 * sessions.repo.js — Session and CSRF token persistence (Postgres / Neon).
 */

import crypto from 'node:crypto';
import { getSql } from '../client.js';

const CSRF_TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24h, survives cold starts

function rowToSession(row) {
  if (!row) return null;
  // Neon returns BIGINT as string by default — coerce to Number for our use
  // (timestamps fit in 53 bits until year 287396).
  return {
    id: row.id,
    account_id: row.account_id || null,
    profile_id: row.profile_id || null,
    csrf_token: row.csrf_token || null,
    csrf_expires_at: row.csrf_expires_at != null ? Number(row.csrf_expires_at) : null,
    created_at: row.created_at != null ? Number(row.created_at) : null,
    last_seen_at: row.last_seen_at != null ? Number(row.last_seen_at) : null,
    expires_at: row.expires_at != null ? Number(row.expires_at) : null,
  };
}

export async function getSession(id) {
  const sql = getSql();
  const rows = await sql`SELECT * FROM sessions WHERE id = ${id}`;
  const session = rowToSession(rows[0]);
  if (!session) return null;
  if (session.expires_at != null && session.expires_at < Date.now()) {
    await sql`DELETE FROM sessions WHERE id = ${id}`;
    return null;
  }
  return session;
}

export async function createSession(data) {
  const sql = getSql();
  const now = Date.now();
  const expiresAt = data.expires_at || (now + 30 * 24 * 60 * 60 * 1000);
  await sql`
    INSERT INTO sessions (id, account_id, profile_id, csrf_token, csrf_expires_at, created_at, last_seen_at, expires_at)
    VALUES (${data.id}, ${data.account_id || null}, ${data.profile_id || null}, NULL, NULL, ${now}, ${now}, ${expiresAt})
  `;
  return getSession(data.id);
}

export async function updateSession(id, data) {
  const sql = getSql();
  if (Object.prototype.hasOwnProperty.call(data, 'account_id')) {
    await sql`UPDATE sessions SET account_id = ${data.account_id || null} WHERE id = ${id}`;
  }
  if (Object.prototype.hasOwnProperty.call(data, 'profile_id')) {
    await sql`UPDATE sessions SET profile_id = ${data.profile_id || null} WHERE id = ${id}`;
  }
  return getSession(id);
}

export async function updateSessionLastSeen(id) {
  const sql = getSql();
  await sql`UPDATE sessions SET last_seen_at = ${Date.now()} WHERE id = ${id}`;
}

export async function deleteSession(id) {
  const sql = getSql();
  await sql`DELETE FROM sessions WHERE id = ${id}`;
}

export async function cleanExpiredSessions() {
  const sql = getSql();
  const rows = await sql`DELETE FROM sessions WHERE expires_at < ${Date.now()} RETURNING id`;
  return Array.isArray(rows) ? rows.length : 0;
}

// ── CSRF ───────────────────────────────────────────────────────────────────────

export async function generateCsrfToken(sessionId) {
  const sql = getSql();
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = Date.now() + CSRF_TOKEN_TTL_MS;
  await sql`
    UPDATE sessions
       SET csrf_token = ${token}, csrf_expires_at = ${expiresAt}
     WHERE id = ${sessionId}
  `;
  return token;
}

export async function validateCsrfToken(sessionId, token) {
  if (!token) return false;
  const sql = getSql();
  const rows = await sql`SELECT csrf_token, csrf_expires_at FROM sessions WHERE id = ${sessionId}`;
  const row = rows[0];
  if (!row || !row.csrf_token) return false;
  const exp = row.csrf_expires_at != null ? Number(row.csrf_expires_at) : null;
  if (exp != null && Date.now() > exp) return false;
  const a = Buffer.from(String(token));
  const b = Buffer.from(String(row.csrf_token));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export async function rotateCsrfToken(sessionId) {
  return generateCsrfToken(sessionId);
}
