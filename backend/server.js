'use strict';

const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

const db = require('./db.js');

const ROOT_DIR = path.resolve(__dirname, '..');
const DATA_DIR = path.join(__dirname, 'data');
const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, 'app.db');

const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || '0.0.0.0';
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const SESSION_COOKIE = 'fp_session';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

const MAX_SYNC_STATE_BYTES = 2 * 1024 * 1024;

const ALLOWED_CURRENCIES = new Set(['EUR', 'USD', 'GBP', 'CHF']);
const ALLOWED_LOCALES = new Set(['it-IT', 'en-US', 'de-DE', 'fr-FR']);

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
};

// ── Security headers ────────────────────────────────────────────────────────────

function baseHeaders(extra = {}) {
  return {
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Frame-Options': 'DENY',
    'Content-Security-Policy': [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data:",
      "connect-src 'self'",
      "frame-ancestors 'none'",
    ].join('; '),
    ...extra,
  };
}

function sendJson(res, status, payload, extraHeaders = {}) {
  res.writeHead(status, baseHeaders({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...extraHeaders,
  }));
  res.end(JSON.stringify(payload));
}

// ── Cookie helpers ──────────────────────────────────────────────────────────────

function parseCookies(header = '') {
  return header.split(';').reduce((cookies, part) => {
    const [rawName, ...rawValue] = part.trim().split('=');
    if (!rawName) return cookies;
    cookies[rawName] = decodeURIComponent(rawValue.join('=') || '');
    return cookies;
  }, {});
}

function signSessionId(sessionId) {
  return crypto.createHmac('sha256', SESSION_SECRET).update(sessionId).digest('hex');
}

function encodeSessionCookie(sessionId) {
  return `${sessionId}.${signSessionId(sessionId)}`;
}

function verifySessionCookie(value = '') {
  const lastDot = value.lastIndexOf('.');
  if (lastDot < 1) return null;
  const sessionId = value.slice(0, lastDot);
  const signature = value.slice(lastDot + 1);
  if (!sessionId || !signature) return null;
  const expected = signSessionId(sessionId);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return sessionId;
}

function setCookieHeader(req, sessionId) {
  const cookieParts = [
    `${SESSION_COOKIE}=${encodeURIComponent(encodeSessionCookie(sessionId))}`,
    'HttpOnly',
    'SameSite=Lax',
    'Path=/',
    'Max-Age=2592000',
  ];
  if (req.socket.encrypted || req.headers['x-forwarded-proto'] === 'https') {
    cookieParts[cookieParts.indexOf('SameSite=Lax')] = 'SameSite=None';
    cookieParts.push('Secure');
  }
  return cookieParts.join('; ');
}

function clearCookieHeader() {
  return `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`;
}

// ── Session management ──────────────────────────────────────────────────────────

/**
 * Get or create a session from the request cookie.
 * Returns the DB session row (with csrf_token populated if needed).
 */
function getOrCreateSession(req, res) {
  const cookies = parseCookies(req.headers.cookie || '');
  const raw = cookies[SESSION_COOKIE];
  const verifiedId = verifySessionCookie(raw);

  let session = null;
  if (verifiedId) {
    session = db.getSession(verifiedId);
  }

  if (!session) {
    // Create brand-new session
    const newId = crypto.randomBytes(32).toString('hex');
    session = db.createSession({
      id: newId,
      expires_at: Date.now() + SESSION_TTL_MS,
    });
    // Generate CSRF token for new session
    const csrfToken = db.generateCsrfToken(newId);
    session = db.getSession(newId);
    session.csrf_token = csrfToken;
  }

  res.setHeader('Set-Cookie', setCookieHeader(req, session.id));
  db.updateSessionLastSeen(session.id);
  return session;
}

// ── CSRF ────────────────────────────────────────────────────────────────────────

/**
 * Validate the x-csrf-token header against the session's stored token.
 */
function assertCsrf(req, session) {
  const token = req.headers['x-csrf-token'];
  return db.validateCsrfToken(session.id, token);
}

// ── Body parsing ────────────────────────────────────────────────────────────────

async function readBody(req, maxBytes = 256 * 1024) {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (Buffer.byteLength(body) > maxBytes) {
      const error = new Error('Payload troppo grande');
      error.status = 413;
      throw error;
    }
  }
  return body ? JSON.parse(body) : {};
}

// ── Input sanitizers ────────────────────────────────────────────────────────────

function normalizeEmail(value = '') {
  return String(value).trim().toLowerCase();
}

function safeAccountId(value = '') {
  const id = String(value).trim();
  return /^[a-zA-Z0-9_-]{1,120}$/.test(id) ? id : '';
}

function isoDateOrNull(value) {
  const time = Date.parse(value || '');
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

function sanitizeSyncState(state = {}) {
  const input = state && typeof state === 'object' && !Array.isArray(state) ? state : {};
  const meta = input.meta && typeof input.meta === 'object' ? input.meta : {};
  return {
    ...input,
    transactions: Array.isArray(input.transactions) ? input.transactions : [],
    recurringEntries: Array.isArray(input.recurringEntries) ? input.recurringEntries : [],
    recurringExpenses: Array.isArray(input.recurringExpenses) ? input.recurringExpenses : [],
    savingsGoals: Array.isArray(input.savingsGoals) ? input.savingsGoals : [],
    settings: input.settings && typeof input.settings === 'object' ? input.settings : {},
    meta: {
      ...meta,
      schemaVersion: Number(meta.schemaVersion) || 3,
      storageScope: 'private-backend-sync',
      updatedAt: isoDateOrNull(meta.updatedAt) || new Date().toISOString(),
    },
  };
}

function sanitizeProfile(profile = {}) {
  const userName = String(profile.userName || '').trim().slice(0, 80);
  const currency = ALLOWED_CURRENCIES.has(profile.currency) ? profile.currency : 'EUR';
  const locale = ALLOWED_LOCALES.has(profile.locale) ? profile.locale : 'it-IT';
  return { userName, currency, locale };
}

function isInsidePath(parent, child) {
  const relative = path.relative(parent, child);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

// ── Assistant analysis (unchanged logic) ────────────────────────────────────────

function normalizeDisplayName(value = '') {
  return String(value).trim().replace(/\s+/g, ' ');
}

function currentMonthTransactions(transactions) {
  const now = new Date();
  return transactions.filter(tx => {
    const date = new Date(tx.date);
    return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
  });
}

function sumByType(transactions, type) {
  return transactions
    .filter(tx => tx.type === type)
    .reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
}

function topExpenseCategory(transactions) {
  const totals = new Map();
  transactions
    .filter(tx => tx.type === 'expense')
    .forEach(tx => totals.set(tx.category, (totals.get(tx.category) || 0) + Number(tx.amount || 0)));
  return [...totals.entries()]
    .map(([category, total]) => ({ category, total }))
    .sort((a, b) => b.total - a.total)[0] || null;
}

function formatCurrency(value, settings) {
  return new Intl.NumberFormat(settings.locale || 'it-IT', {
    style: 'currency',
    currency: settings.currency || 'EUR',
  }).format(Number(value || 0));
}

function formatPercent(value) {
  return new Intl.NumberFormat('it-IT', {
    style: 'percent',
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function normalizeRecurringEntries(state = {}) {
  const map = new Map();
  const legacyExpenses = Array.isArray(state.recurringExpenses)
    ? state.recurringExpenses.map(item => ({ ...item, type: 'expense' }))
    : [];
  const entries = Array.isArray(state.recurringEntries) ? state.recurringEntries : [];
  [...legacyExpenses, ...entries].forEach(item => {
    if (!item || typeof item !== 'object') return;
    const id = String(item.id || `${item.type}-${item.category}-${item.amount}-${item.startDate}`);
    map.set(id, { ...item, type: item.type === 'income' ? 'income' : 'expense', frequency: item.frequency === 'yearly' ? 'yearly' : 'monthly' });
  });
  return [...map.values()];
}

function isFixedSource(source) {
  return source === 'monthly' || source === 'yearly';
}

function monthlyOverview(transactions) {
  const fixedIncome = transactions.filter(tx => tx.type === 'income' && isFixedSource(tx.source)).reduce((s, tx) => s + Number(tx.amount || 0), 0);
  const variableIncome = transactions.filter(tx => tx.type === 'income' && !isFixedSource(tx.source)).reduce((s, tx) => s + Number(tx.amount || 0), 0);
  const savings = transactions.filter(tx => tx.type === 'expense' && tx.category === 'salvadanaio').reduce((s, tx) => s + Number(tx.amount || 0), 0);
  const fixedExpenses = transactions.filter(tx => tx.type === 'expense' && isFixedSource(tx.source) && tx.category !== 'salvadanaio').reduce((s, tx) => s + Number(tx.amount || 0), 0);
  const variableExpenses = transactions.filter(tx => tx.type === 'expense' && !isFixedSource(tx.source) && tx.category !== 'salvadanaio').reduce((s, tx) => s + Number(tx.amount || 0), 0);
  return { fixedIncome, variableIncome, fixedExpenses, variableExpenses, savings, liquidMoney: fixedIncome + variableIncome - fixedExpenses - variableExpenses - savings };
}

function buildAssistantReply(question = '', state = {}) {
  const settings = sanitizeProfile(state.settings || {});
  const transactions = Array.isArray(state.transactions) ? state.transactions : [];
  const recurringEntries = normalizeRecurringEntries(state);
  const monthTxs = currentMonthTransactions(transactions);
  const income = sumByType(monthTxs, 'income');
  const expense = sumByType(monthTxs, 'expense');
  const balance = income - expense;
  const overview = monthlyOverview(monthTxs);
  const fixedIncomePlanned = recurringEntries.filter(i => i.active !== false && i.type === 'income').reduce((s, i) => s + Number(i.amount || 0), 0);
  const fixedPlanned = recurringEntries.filter(i => i.active !== false && i.type === 'expense' && i.category !== 'salvadanaio').reduce((s, i) => s + Number(i.amount || 0), 0);
  const fixedPaid = overview.fixedExpenses;
  const manualExpense = overview.variableExpenses;
  const topCategory = topExpenseCategory(monthTxs);
  const expenseRate = income > 0 ? expense / income : 0;
  const fixedRate = income > 0 ? fixedPlanned / income : 0;

  let score = 78;
  const reasoning = [];
  const actions = [];

  if (transactions.length === 0) {
    score = 35;
    reasoning.push('Non ci sono ancora movimenti sufficienti: la valutazione e poco affidabile.');
    actions.push('Registra almeno entrate, spese fisse e 5-10 spese variabili del mese.');
  } else {
    reasoning.push(`Entrate ${formatCurrency(income, settings)}, spese ${formatCurrency(expense, settings)}, saldo ${formatCurrency(balance, settings)}.`);
  }
  if (income <= 0 && expense > 0) { score -= 25; reasoning.push('Ci sono spese senza entrate nel mese: il saldo non rappresenta ancora un budget completo.'); actions.push('Aggiungi le entrate ricorrenti prima di prendere decisioni sui tagli.'); }
  else if (expenseRate >= 0.9) { score -= 24; reasoning.push(`Le spese assorbono ${formatPercent(expenseRate)} delle entrate: margine di sicurezza molto basso.`); actions.push('Imposta un tetto settimanale sulle spese manuali fino a riportare il rapporto sotto il 75%.'); }
  else if (expenseRate >= 0.75) { score -= 10; reasoning.push(`Le spese assorbono ${formatPercent(expenseRate)} delle entrate: gestione sostenibile ma fragile.`); actions.push('Riduci prima le categorie variabili, non le spese essenziali.'); }
  else if (income > 0) { score += 6; reasoning.push(`Il rapporto spese/entrate e ${formatPercent(expenseRate)}: resta spazio per risparmio o fondo emergenza.`); }
  if (balance < 0) { score -= 18; reasoning.push('Il saldo mensile e negativo: le uscite superano le entrate registrate.'); actions.push('Blocca nuove spese non essenziali finche il saldo mensile torna positivo.'); }
  if (fixedRate > 0.5) { score -= 12; reasoning.push(`Le spese fisse pianificate pesano ${formatPercent(fixedRate)} delle entrate: il budget e poco flessibile.`); actions.push('Rinegozia o sostituisci almeno una spesa fissa ad alto importo.'); }
  else if (fixedPlanned > 0 && income > 0) { reasoning.push(`Spese fisse pianificate: ${formatCurrency(fixedPlanned, settings)} (${formatPercent(fixedRate)} delle entrate).`); }
  if (fixedIncomePlanned > 0) { reasoning.push(`Entrate fisse pianificate: ${formatCurrency(fixedIncomePlanned, settings)}. Liquidita libera stimata nel mese: ${formatCurrency(overview.liquidMoney, settings)}.`); }
  if (topCategory && expense > 0 && topCategory.total / expense > 0.35) { reasoning.push(`La categoria piu pesante e ${topCategory.category}: ${formatCurrency(topCategory.total, settings)}.`); actions.push(`Controlla le ultime voci in "${topCategory.category}" e cerca una riduzione mirata del 5-10%.`); }
  if (manualExpense > fixedPaid && manualExpense > 0) { reasoning.push(`Spese manuali del mese: ${formatCurrency(manualExpense, settings)} contro ${formatCurrency(fixedPaid, settings)} gia generate da spese mensili.`); }
  if (String(question).toLowerCase().includes('dati')) { actions.push('Per dati sensibili usa il backend locale e non inserire credenziali bancarie nell app.'); }

  const boundedScore = Math.max(0, Math.min(100, Math.round(score)));
  const level = boundedScore >= 75 ? 'buona' : boundedScore >= 55 ? 'da monitorare' : 'critica';
  if (actions.length === 0) actions.push('Mantieni la separazione tra spese fisse e manuali e controlla il saldo una volta a settimana.');

  return [
    `Analisi AI backend: gestione ${level}, score ${boundedScore}/100.`,
    'Ragionamento:',
    ...reasoning.slice(0, 5).map(item => `- ${item}`),
    'Azioni consigliate:',
    ...actions.slice(0, 4).map(item => `- ${item}`),
    'Nota: analisi automatica dei dati inseriti, non consulenza finanziaria certificata.',
  ].join('\n');
}

// ── Helper: generateId ──────────────────────────────────────────────────────────

function generateId() {
  return crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');
}

// ── API handler ─────────────────────────────────────────────────────────────────

async function handleApi(req, res, url) {
  // Handle preflight for all API routes
  if (req.method === 'OPTIONS') {
    res.writeHead(204, baseHeaders({ Allow: 'GET,POST,PUT,DELETE,OPTIONS' }));
    res.end();
    return;
  }

  const pathClean = url.pathname.replace(/\/$/, '');
  console.log(`[API] ${req.method} ${pathClean}`);

  // ── Health ────────────────────────────────────────────────────────────────────
  if (pathClean === '/api/health' && req.method === 'GET') {
    sendJson(res, 200, { ok: true, service: 'finanza-personale-backend' });
    return;
  }

  // ── Session (no CSRF check, only GET) ────────────────────────────────────────
  if (pathClean === '/api/session' && req.method === 'GET') {
    const session = getOrCreateSession(req, res);
    // Rotate CSRF token on every GET /api/session
    const csrfToken = db.rotateCsrfToken(session.id);
    sendJson(res, 200, {
      ok: true,
      csrfToken,
      accountId: session.account_id || null,
      profileId: session.profile_id || null,
    });
    return;
  }

  // ── Auth: register ────────────────────────────────────────────────────────────
  if (pathClean === '/api/auth/register' && req.method === 'POST') {
    const session = getOrCreateSession(req, res);
    if (!assertCsrf(req, session)) {
      sendJson(res, 403, { error: 'Token CSRF non valido' });
      return;
    }
    const body = await readBody(req);
    const email = normalizeEmail(body.email || '');
    const password = String(body.password || '');
    const profileUsername = String(body.profileUsername || '').trim();
    const profilePassword = String(body.profilePassword || '');
    const currency = ALLOWED_CURRENCIES.has(body.currency) ? body.currency : 'EUR';
    const locale = ALLOWED_LOCALES.has(body.locale) ? body.locale : 'it-IT';

    if (!email || !email.includes('@') || email.length < 5) {
      sendJson(res, 400, { error: 'Email non valida.' });
      return;
    }
    if (password.length < 8) {
      sendJson(res, 400, { error: 'La password deve avere almeno 8 caratteri.' });
      return;
    }
    if (profileUsername.length < 2) {
      sendJson(res, 400, { error: 'Il nome profilo deve avere almeno 2 caratteri.' });
      return;
    }
    if (profilePassword.length < 8) {
      sendJson(res, 400, { error: 'La password del profilo deve avere almeno 8 caratteri.' });
      return;
    }

    // Check duplicate email
    if (db.getAccountByEmail(email)) {
      sendJson(res, 409, { error: 'Un account con questa email esiste già.' });
      return;
    }

    const now = new Date().toISOString();
    const accountId = generateId();
    const profileId = generateId();

    const account = db.createAccount({ id: accountId, email, password, createdAt: now });
    const profile = db.createProfile({
      id: profileId,
      accountId,
      username: profileUsername,
      password: profilePassword,
      currency,
      locale,
      storageKey: `finanza:profile:${accountId}:${profileId}`,
      isDefault: true,
      createdAt: now,
    });

    // Bind session
    db.updateSession(session.id, { account_id: accountId, profile_id: profileId });
    const csrfToken = db.rotateCsrfToken(session.id);

    sendJson(res, 201, {
      account: { id: account.id, email: account.email, createdAt: account.createdAt },
      profile: { id: profile.id, username: profile.username, currency: profile.currency, locale: profile.locale, storageKey: profile.storageKey },
      csrfToken,
    });
    return;
  }

  // ── Auth: login ───────────────────────────────────────────────────────────────
  if (pathClean === '/api/auth/login' && req.method === 'POST') {
    const session = getOrCreateSession(req, res);
    if (!assertCsrf(req, session)) {
      sendJson(res, 403, { error: 'Token CSRF non valido' });
      return;
    }
    const body = await readBody(req);
    const email = normalizeEmail(body.email || '');
    const password = String(body.password || '');

    const account = db.getAccountByEmail(email);
    if (!account || !db.verifyPassword(password, account)) {
      sendJson(res, 401, { error: 'Credenziali non valide.' });
      return;
    }

    // Update last_login_at
    db.updateAccount(account.id, { lastLoginAt: new Date().toISOString() });

    // Bind account (not profile yet)
    db.updateSession(session.id, { account_id: account.id, profile_id: null });
    const csrfToken = db.rotateCsrfToken(session.id);

    const profiles = db.getProfilesByAccount(account.id).map(p => ({
      id: p.id,
      username: p.username,
      currency: p.currency,
      locale: p.locale,
      isDefault: p.isDefault,
    }));

    sendJson(res, 200, {
      account: { id: account.id, email: account.email },
      profiles,
      csrfToken,
    });
    return;
  }

  // ── Auth: select profile ──────────────────────────────────────────────────────
  if (pathClean === '/api/auth/profile/select' && req.method === 'POST') {
    const session = getOrCreateSession(req, res);
    if (!session.account_id) {
      sendJson(res, 401, { error: 'Autenticazione richiesta.' });
      return;
    }
    if (!assertCsrf(req, session)) {
      sendJson(res, 403, { error: 'Token CSRF non valido' });
      return;
    }
    const body = await readBody(req);
    const profileId = String(body.profileId || '').trim();
    const password = String(body.password || '');

    const profile = db.getProfile(profileId);
    if (!profile) {
      sendJson(res, 404, { error: 'Profilo non trovato.' });
      return;
    }
    if (profile.accountId !== session.account_id) {
      sendJson(res, 403, { error: 'Accesso negato.' });
      return;
    }
    if (!db.verifyPassword(password, profile)) {
      sendJson(res, 401, { error: 'Password profilo non corretta.' });
      return;
    }

    db.updateSession(session.id, { profile_id: profileId });
    const csrfToken = db.rotateCsrfToken(session.id);

    sendJson(res, 200, {
      profile: { id: profile.id, username: profile.username, currency: profile.currency, locale: profile.locale, storageKey: profile.storageKey },
      csrfToken,
    });
    return;
  }

  // ── Auth: create profile ──────────────────────────────────────────────────────
  if (pathClean === '/api/auth/profile/create' && req.method === 'POST') {
    const session = getOrCreateSession(req, res);
    if (!session.account_id) {
      sendJson(res, 401, { error: 'Autenticazione richiesta.' });
      return;
    }
    if (!assertCsrf(req, session)) {
      sendJson(res, 403, { error: 'Token CSRF non valido' });
      return;
    }
    const body = await readBody(req);
    const username = String(body.username || '').trim();
    const password = String(body.password || '');
    const currency = ALLOWED_CURRENCIES.has(body.currency) ? body.currency : 'EUR';
    const locale = ALLOWED_LOCALES.has(body.locale) ? body.locale : 'it-IT';

    if (username.length < 2) {
      sendJson(res, 400, { error: 'Il nome profilo deve avere almeno 2 caratteri.' });
      return;
    }
    if (password.length < 8) {
      sendJson(res, 400, { error: 'La password deve avere almeno 8 caratteri.' });
      return;
    }

    const profileId = generateId();
    const accountId = session.account_id;

    let profile;
    try {
      profile = db.createProfile({
        id: profileId,
        accountId,
        username,
        password,
        currency,
        locale,
        storageKey: `finanza:profile:${accountId}:${profileId}`,
        isDefault: false,
        createdAt: new Date().toISOString(),
      });
    } catch (e) {
      if (e.message && e.message.includes('UNIQUE')) {
        sendJson(res, 409, { error: 'Un profilo con questo nome esiste già.' });
        return;
      }
      throw e;
    }

    sendJson(res, 201, {
      profile: { id: profile.id, username: profile.username, currency: profile.currency, locale: profile.locale, storageKey: profile.storageKey },
    });
    return;
  }

  // ── Auth: delete profile ──────────────────────────────────────────────────────
  if (pathClean.startsWith('/api/auth/profile/') && req.method === 'DELETE') {
    const session = getOrCreateSession(req, res);
    if (!session.account_id) {
      sendJson(res, 401, { error: 'Autenticazione richiesta.' });
      return;
    }
    if (!assertCsrf(req, session)) {
      sendJson(res, 403, { error: 'Token CSRF non valido' });
      return;
    }
    const profileId = pathClean.replace('/api/auth/profile/', '');
    const profile = db.getProfile(profileId);
    if (!profile || profile.accountId !== session.account_id) {
      sendJson(res, 403, { error: 'Accesso negato.' });
      return;
    }
    const allProfiles = db.getProfilesByAccount(session.account_id);
    if (allProfiles.length <= 1) {
      sendJson(res, 400, { error: 'Non puoi eliminare l\'unico profilo dell\'account.' });
      return;
    }
    db.deleteProfile(profileId);
    sendJson(res, 200, { ok: true });
    return;
  }

  // ── Auth: me ──────────────────────────────────────────────────────────────────
  if (pathClean === '/api/auth/me' && req.method === 'GET') {
    const session = getOrCreateSession(req, res);
    if (!session.account_id) {
      sendJson(res, 401, { error: 'Non autenticato.' });
      return;
    }
    const account = db.getAccount(session.account_id);
    if (!account) {
      // Session references a deleted account — clean up
      db.updateSession(session.id, { account_id: null, profile_id: null });
      sendJson(res, 401, { error: 'Non autenticato.' });
      return;
    }
    const profiles = db.getProfilesByAccount(account.id).map(p => ({
      id: p.id,
      username: p.username,
      currency: p.currency,
      locale: p.locale,
      isDefault: p.isDefault,
    }));
    const activeProfile = session.profile_id ? db.getProfile(session.profile_id) : null;
    sendJson(res, 200, {
      account: { id: account.id, email: account.email },
      profile: activeProfile ? {
        id: activeProfile.id,
        username: activeProfile.username,
        currency: activeProfile.currency,
        locale: activeProfile.locale,
        storageKey: activeProfile.storageKey,
      } : null,
      profiles,
    });
    return;
  }

  // ── Auth: logout ──────────────────────────────────────────────────────────────
  if (pathClean === '/api/auth/logout' && req.method === 'POST') {
    const cookies = parseCookies(req.headers.cookie || '');
    const raw = cookies[SESSION_COOKIE];
    const verifiedId = verifySessionCookie(raw);
    if (verifiedId) {
      db.deleteSession(verifiedId);
    }
    res.setHeader('Set-Cookie', clearCookieHeader());
    sendJson(res, 200, { ok: true });
    return;
  }

  // ── Legacy profile endpoint (settings style) ──────────────────────────────────
  if (pathClean === '/api/profile' && req.method === 'GET') {
    const session = getOrCreateSession(req, res);
    let profileData = {};
    if (session.profile_id) {
      const p = db.getProfile(session.profile_id);
      if (p) profileData = { userName: p.username, currency: p.currency, locale: p.locale };
    }
    sendJson(res, 200, sanitizeProfile(profileData));
    return;
  }

  if (pathClean === '/api/profile' && req.method === 'PUT') {
    const session = getOrCreateSession(req, res);
    if (!assertCsrf(req, session)) {
      sendJson(res, 403, { error: 'Token CSRF non valido' });
      return;
    }
    const body = await readBody(req);
    const clean = sanitizeProfile(body);
    // Best-effort: if profile_id in session, update currency/locale
    if (session.profile_id) {
      db.updateProfile(session.profile_id, { currency: clean.currency, locale: clean.locale });
    }
    sendJson(res, 200, clean);
    return;
  }

  // ── Sync state ────────────────────────────────────────────────────────────────
  if (pathClean === '/api/sync/state' && req.method === 'GET') {
    const session = getOrCreateSession(req, res);
    if (!session.account_id) {
      sendJson(res, 403, { error: 'Accedi all\'account prima di sincronizzare i dati.' });
      return;
    }
    const profileId = url.searchParams.get('profileId') || session.profile_id;
    if (!profileId) {
      sendJson(res, 400, { error: 'profileId richiesto.' });
      return;
    }
    const row = db.getSyncState(session.account_id, profileId);
    sendJson(res, 200, row ? { exists: true, state: row.state } : { exists: false, state: null });
    return;
  }

  if (pathClean === '/api/sync/state' && req.method === 'PUT') {
    const session = getOrCreateSession(req, res);
    if (!session.account_id) {
      sendJson(res, 403, { error: 'Accedi all\'account prima di sincronizzare i dati.' });
      return;
    }
    if (!assertCsrf(req, session)) {
      sendJson(res, 403, { error: 'Token CSRF non valido' });
      return;
    }
    const body = await readBody(req, MAX_SYNC_STATE_BYTES);
    const profileId = body.profileId || session.profile_id;
    if (!profileId) {
      sendJson(res, 400, { error: 'profileId richiesto.' });
      return;
    }
    const cleanState = sanitizeSyncState(body.state);
    db.upsertSyncState(session.account_id, profileId, cleanState);
    // Mark profile syncedAt
    if (session.profile_id) {
      db.updateProfile(session.profile_id, { syncedAt: new Date().toISOString() });
    }
    sendJson(res, 200, { exists: true, state: cleanState });
    return;
  }

  // ── Assistant ─────────────────────────────────────────────────────────────────
  if (pathClean === '/api/assistant/analyze' && req.method === 'POST') {
    const session = getOrCreateSession(req, res);
    if (!assertCsrf(req, session)) {
      sendJson(res, 403, { error: 'Token CSRF non valido' });
      return;
    }
    const body = await readBody(req);
    sendJson(res, 200, { reply: buildAssistantReply(body.question, body.state) });
    return;
  }

  sendJson(res, 404, { error: 'Endpoint non trovato' });
}

// ── Static file serving ─────────────────────────────────────────────────────────

async function serveStatic(req, res, url) {
  const pathname = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
  const filePath = path.resolve(ROOT_DIR, `.${pathname}`);
  const backendDataPath = path.resolve(DATA_DIR);

  if (!isInsidePath(ROOT_DIR, filePath) || isInsidePath(backendDataPath, filePath)) {
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

// ── HTTP server ─────────────────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
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

if (require.main === module) {
  // Ensure data dir exists
  require('node:fs').mkdirSync(DATA_DIR, { recursive: true });

  // Initialize SQLite DB
  db.initDb(DB_PATH);

  // Schedule periodic cleanup of expired sessions (every hour)
  setInterval(() => {
    try {
      const removed = db.cleanExpiredSessions();
      if (removed > 0) console.log(`[DB] Cleaned ${removed} expired sessions`);
    } catch (e) {
      console.error('[DB] Cleanup error:', e);
    }
  }, 60 * 60 * 1000);

  server.listen(PORT, HOST, () => {
    const displayHost = HOST === '0.0.0.0' ? '<IP-locale>' : HOST;
    console.log(`FinanzaPersonale backend: http://${displayHost}:${PORT}`);
  });
}

module.exports = { server, buildAssistantReply };
