/**
 * accounts.repo.js — Account persistence (Postgres / Neon).
 */

import crypto from 'node:crypto';
import { getSql } from '../client.js';

const PBKDF2_ITERATIONS = 120000;
const PBKDF2_KEYLEN = 32;
const PBKDF2_DIGEST = 'sha256';

export function generateSalt() {
  return crypto.randomBytes(16).toString('hex');
}

export function hashPassword(password, salt, algorithm, iterations) {
  const algo = algorithm || 'pbkdf2';
  if (algo === 'pbkdf2') {
    return crypto
      .pbkdf2Sync(String(password), salt, iterations || PBKDF2_ITERATIONS, PBKDF2_KEYLEN, PBKDF2_DIGEST)
      .toString('hex');
  }
  // fallback-hash kept only for legacy compatibility
  let h = 2166136261;
  const combined = String(password) + String(salt);
  for (let i = 0; i < combined.length; i++) {
    h ^= combined.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

export function verifyPassword(password, record) {
  if (!record || !record.passwordSalt || !record.passwordHash) return false;
  const computed = hashPassword(password, record.passwordSalt, record.passwordAlgorithm, record.passwordIterations);
  const a = Buffer.from(String(computed));
  const b = Buffer.from(String(record.passwordHash));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

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
    lastProfileId: row.last_profile_id || null,
  };
}

export async function getAccount(id) {
  const sql = getSql();
  const rows = await sql`SELECT * FROM accounts WHERE id = ${id}`;
  return rowToAccount(rows[0]);
}

export async function getAccountByEmail(email) {
  const sql = getSql();
  const clean = String(email || '').toLowerCase().trim();
  const rows = await sql`SELECT * FROM accounts WHERE email = ${clean}`;
  return rowToAccount(rows[0]);
}

export async function createAccount(data) {
  const sql = getSql();
  const now = data.createdAt || new Date().toISOString();
  const salt = data.salt || generateSalt();
  const algorithm = data.algorithm || 'pbkdf2';
  const iterations = data.iterations || PBKDF2_ITERATIONS;
  const hash = data.hash || hashPassword(data.password, salt, algorithm, iterations);
  const email = String(data.email).toLowerCase().trim();

  await sql`
    INSERT INTO accounts
      (id, email, password_algorithm, password_salt, password_hash, password_iterations, created_at)
    VALUES (${data.id}, ${email}, ${algorithm}, ${salt}, ${hash}, ${iterations}, ${now})
  `;
  return getAccount(data.id);
}

export async function updateAccount(id, data) {
  const sql = getSql();
  if (data.lastLoginAt !== undefined) {
    await sql`UPDATE accounts SET last_login_at = ${data.lastLoginAt} WHERE id = ${id}`;
  }
  if (data.email !== undefined) {
    const clean = String(data.email).toLowerCase().trim();
    await sql`UPDATE accounts SET email = ${clean} WHERE id = ${id}`;
  }
  if (data.lastProfileId !== undefined) {
    await sql`UPDATE accounts SET last_profile_id = ${data.lastProfileId} WHERE id = ${id}`;
  }
  return getAccount(id);
}
