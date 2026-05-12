/**
 * db/client.js — Neon Postgres client (HTTP transport)
 *
 * Uses @neondatabase/serverless which works over HTTPS — no socket
 * connections required. Ideal for Render free tier (cold starts) and
 * serverless environments.
 *
 * Required env var: DATABASE_URL (e.g. postgres://user:pass@host/db?sslmode=require)
 */

import { neon } from '@neondatabase/serverless';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  if (process.env.NODE_ENV === 'production') {
    // Fail-fast in production — there is no fallback storage.
    console.error('[DB] FATAL: DATABASE_URL is not set in production.');
    throw new Error('DATABASE_URL is required in production');
  } else {
    // Dev: warn but allow boot (caller will get a thrown error on first query)
    console.warn('[DB] DATABASE_URL is not set. Set it to a Neon Postgres URL.');
  }
}

/**
 * Tagged-template SQL function. Usage:
 *   const rows = await sql`SELECT * FROM accounts WHERE id = ${id}`;
 * Returns an array of rows.
 */
export const sql = databaseUrl ? neon(databaseUrl) : null;

/**
 * Helper: throws a clear error if sql is null.
 */
export function getSql() {
  if (!sql) throw new Error('DATABASE_URL is not configured. Set it to a Neon Postgres URL.');
  return sql;
}
