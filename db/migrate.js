/**
 * db/migrate.js — Idempotent migration runner
 *
 * Reads .sql files from db/migrations/ in lexical order and executes them
 * against the configured Neon Postgres database. Each migration is expected
 * to be idempotent (use CREATE TABLE IF NOT EXISTS, etc.) — we do NOT track
 * applied versions in a table, by design.
 *
 * The neon HTTP transport accepts only a single statement per call, so we
 * split the migration file into individual statements while preserving
 * dollar-quoted blocks (e.g. DO $$ ... $$).
 */

import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getSql } from './client.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

/**
 * Split a SQL script into individual statements.
 * Handles:
 *   - line comments (-- ...)
 *   - dollar-quoted blocks ($$ ... $$ or $tag$ ... $tag$)
 *   - semicolons as statement terminators
 */
export function splitSqlStatements(source) {
  const stmts = [];
  let buf = '';
  let i = 0;
  let inDollar = null; // current $tag$ marker
  let inLineComment = false;

  while (i < source.length) {
    const ch = source[i];
    const next = source[i + 1];

    if (inLineComment) {
      buf += ch;
      if (ch === '\n') inLineComment = false;
      i++;
      continue;
    }

    if (inDollar) {
      buf += ch;
      // Look for closing tag
      if (ch === '$' && source.startsWith(inDollar, i)) {
        buf += source.slice(i + 1, i + inDollar.length);
        i += inDollar.length;
        inDollar = null;
        continue;
      }
      i++;
      continue;
    }

    // line comment?
    if (ch === '-' && next === '-') {
      inLineComment = true;
      buf += ch;
      i++;
      continue;
    }

    // open dollar quote? match $tag$ or $$
    if (ch === '$') {
      const rest = source.slice(i);
      const m = rest.match(/^\$([A-Za-z_][A-Za-z0-9_]*)?\$/);
      if (m) {
        inDollar = m[0];
        buf += inDollar;
        i += inDollar.length;
        continue;
      }
    }

    if (ch === ';') {
      const trimmed = buf.trim();
      if (trimmed) stmts.push(trimmed);
      buf = '';
      i++;
      continue;
    }

    buf += ch;
    i++;
  }

  const tail = buf.trim();
  if (tail) stmts.push(tail);
  return stmts;
}

/**
 * Run all migrations in order. Safe to call multiple times.
 */
export async function runMigrations() {
  const sql = getSql();
  const files = (await readdir(MIGRATIONS_DIR))
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const fullPath = path.join(MIGRATIONS_DIR, file);
    const contents = await readFile(fullPath, 'utf8');
    const statements = splitSqlStatements(contents);
    console.log(`[DB] Running migration: ${file} (${statements.length} statements)`);
    for (const stmt of statements) {
      // neon() function can be invoked with a plain string for raw SQL.
      // We do NOT use tagged-template form here because that requires
      // build-time string parts.
      await sql(stmt);
    }
  }
  console.log(`[DB] Migrations complete (${files.length} files).`);
}

// Run if invoked directly
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('migrate.js')) {
  runMigrations()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[DB] Migration failed:', err);
      process.exit(1);
    });
}
