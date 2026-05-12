/**
 * backend/server.js — HTTP bootstrap + routing dispatcher.
 *
 * Responsibilities:
 *   1. Start HTTP server
 *   2. Run DB migrations at boot
 *   3. Serve frontend/ as static
 *   4. Dispatch /api/v1/... (and legacy /api/...) to api/*.controller.js
 *   5. Periodic cleanup of expired sessions
 *
 * NOTE: this file does NOT contain business logic. All endpoint handlers live
 * under api/*.controller.js. Middleware lives under backend/middleware/*.
 */

import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { config } from './config.js';
import { baseHeaders, sendJson } from './middleware/errors.js';
import { runMigrations } from '../db/migrate.js';
import * as sessionsRepo from '../db/repositories/sessions.repo.js';

import * as health from '../api/health.controller.js';
import * as sessionCtrl from '../api/session.controller.js';
import * as auth from '../api/auth.controller.js';
import * as profile from '../api/profile.controller.js';
import * as sync from '../api/sync.controller.js';
import * as assistant from '../api/assistant.controller.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_DIR = path.resolve(__dirname, '..', 'frontend');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
};

function isInsidePath(parent, child) {
  const relative = path.relative(parent, child);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

// ── API dispatch ──────────────────────────────────────────────────────────────

/**
 * Strip the API version prefix so /api/v1/foo and /api/foo dispatch identically.
 * Returns the trailing-slash-stripped path.
 */
function normalizeApiPath(pathname) {
  const clean = pathname.replace(/\/$/, '');
  if (clean.startsWith('/api/v1/')) return '/api/' + clean.slice('/api/v1/'.length);
  if (clean === '/api/v1') return '/api';
  return clean;
}

async function handleApi(req, res, url) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, baseHeaders({ Allow: 'GET,POST,PUT,DELETE,OPTIONS' }));
    res.end();
    return;
  }

  const pathClean = normalizeApiPath(url.pathname);
  console.log(`[API] ${req.method} ${url.pathname} -> ${pathClean}`);

  try {
    // ── Public ──────────────────────────────────────────────────────────────
    if (pathClean === '/api/health' && req.method === 'GET') return health.getHealth(req, res);
    if (pathClean === '/api/session' && req.method === 'GET') return await sessionCtrl.getSession(req, res);

    // ── Auth ────────────────────────────────────────────────────────────────
    if (pathClean === '/api/auth/register' && req.method === 'POST') return await auth.register(req, res);
    if (pathClean === '/api/auth/login' && req.method === 'POST') return await auth.login(req, res);
    if (pathClean === '/api/auth/profile/select' && req.method === 'POST') return await auth.selectProfile(req, res);
    if (pathClean === '/api/auth/profile/create' && req.method === 'POST') return await auth.createProfile(req, res);
    if (pathClean.startsWith('/api/auth/profile/') && req.method === 'DELETE') {
      const profileId = pathClean.replace('/api/auth/profile/', '');
      return await auth.deleteProfile(req, res, { profileId });
    }
    if (pathClean === '/api/auth/me' && req.method === 'GET') return await auth.me(req, res);
    if (pathClean === '/api/auth/logout' && req.method === 'POST') return await auth.logout(req, res);

    // ── Profile (legacy settings shape) ─────────────────────────────────────
    if (pathClean === '/api/profile' && req.method === 'GET') return await profile.getProfile(req, res);
    if (pathClean === '/api/profile' && req.method === 'PUT') return await profile.putProfile(req, res);

    // ── Sync state ──────────────────────────────────────────────────────────
    if (pathClean === '/api/sync/state' && req.method === 'GET') return await sync.getSyncState(req, res, { url });
    if (pathClean === '/api/sync/state' && req.method === 'PUT') return await sync.putSyncState(req, res);

    // ── Assistant ───────────────────────────────────────────────────────────
    if (pathClean === '/api/assistant/analyze' && req.method === 'POST') return await assistant.analyze(req, res);

    sendJson(res, 404, { error: 'Endpoint non trovato' });
  } catch (err) {
    console.error(`[API] Error on ${req.method} ${pathClean}:`, err);
    sendJson(res, err.status || 500, { error: err.message || 'Errore server' });
  }
}

// ── Static file serving (frontend/) ───────────────────────────────────────────

async function serveStatic(req, res, url) {
  const pathname = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
  const filePath = path.resolve(FRONTEND_DIR, `.${pathname}`);

  if (!isInsidePath(FRONTEND_DIR, filePath)) {
    sendJson(res, 403, { error: 'Accesso negato' });
    return;
  }

  try {
    const stat = await fs.stat(filePath);
    const finalPath = stat.isDirectory() ? path.join(filePath, 'index.html') : filePath;
    const content = await fs.readFile(finalPath);
    res.writeHead(200, baseHeaders({
      'Content-Type': MIME_TYPES[path.extname(finalPath)] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    }));
    res.end(content);
  } catch (error) {
    sendJson(res, 404, { error: 'Risorsa non trovata' });
  }
}

// ── HTTP server ───────────────────────────────────────────────────────────────

export const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    if (url.pathname.startsWith('/api/')) {
      await handleApi(req, res, url);
      return;
    }
    await serveStatic(req, res, url);
  } catch (error) {
    sendJson(res, error.status || 500, { error: error.message || 'Errore server' });
  }
});

// ── Boot ──────────────────────────────────────────────────────────────────────

const isMain = (() => {
  try {
    return import.meta.url === `file://${process.argv[1]}` ||
           import.meta.url.endsWith(path.basename(process.argv[1] || ''));
  } catch {
    return true;
  }
})();

if (isMain) {
  (async () => {
    try {
      await runMigrations();
    } catch (err) {
      console.error('[DB] Migration error at boot:', err);
      if (config.isProduction) {
        process.exit(1);
      }
    }

    // Periodic cleanup
    setInterval(() => {
      sessionsRepo.cleanExpiredSessions()
        .then((removed) => { if (removed > 0) console.log(`[DB] Cleaned ${removed} expired sessions`); })
        .catch((err) => console.error('[DB] Cleanup error:', err));
    }, 60 * 60 * 1000);

    server.listen(config.port, config.host, () => {
      const displayHost = config.host === '0.0.0.0' ? '<IP-locale>' : config.host;
      console.log(`FinanzaPersonale backend: http://${displayHost}:${config.port}`);
    });
  })();
}

// Re-export for tests
export { buildAssistantReply } from '../api/assistant.controller.js';
