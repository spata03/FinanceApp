/**
 * backend/config.js — Centralized runtime configuration.
 *
 * Fail-fast: in production, missing required env vars throw at boot.
 */

import crypto from 'node:crypto';

const isProduction = process.env.NODE_ENV === 'production';

// ── Required in production ────────────────────────────────────────────────────
const SESSION_SECRET = process.env.SESSION_SECRET || (
  isProduction
    ? (() => { throw new Error('SESSION_SECRET is required in production'); })()
    : crypto.randomBytes(32).toString('hex')
);

const DATABASE_URL = process.env.DATABASE_URL || (
  isProduction
    ? (() => { throw new Error('DATABASE_URL is required in production'); })()
    : null
);

export const config = {
  isProduction,
  port: Number(process.env.PORT || 8080),
  host: process.env.HOST || '0.0.0.0',
  sessionSecret: SESSION_SECRET,
  sessionCookieName: 'fp_session',
  sessionTtlMs: 30 * 24 * 60 * 60 * 1000, // 30 days
  databaseUrl: DATABASE_URL,
  maxSyncStateBytes: 2 * 1024 * 1024,
  allowedCurrencies: new Set(['EUR', 'USD', 'GBP', 'CHF']),
  allowedLocales: new Set(['it-IT', 'en-US', 'de-DE', 'fr-FR']),
};
