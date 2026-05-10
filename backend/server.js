const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT_DIR = path.resolve(__dirname, '..');
const DATA_DIR = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const SESSIONS_FILE = path.join(DATA_DIR, 'sessions.json');
const SYNC_ACCOUNTS_FILE = path.join(DATA_DIR, 'sync-accounts.json');
const SYNC_STATE_DIR = path.join(DATA_DIR, 'sync-state');
const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || '0.0.0.0';
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const SESSION_COOKIE = 'fp_session';
const sessions = new Map();
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
  const [sessionId, signature] = value.split('.');
  if (!sessionId || !signature) return null;
  const expected = signSessionId(sessionId);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return sessionId;
}

function userIdFromSession(sessionId) {
  return crypto.createHash('sha256').update(sessionId).digest('hex').slice(0, 32);
}

function generateCsrfToken(sessionId) {
  // Firma il token con SESSION_SECRET, così rimane valido anche dopo restart
  return crypto.createHmac('sha256', SESSION_SECRET)
    .update(sessionId)
    .digest('hex');
}

function createSession(sessionId = crypto.randomBytes(32).toString('hex')) {
  const session = {
    id: sessionId,
    userId: userIdFromSession(sessionId),
    csrfToken: generateCsrfToken(sessionId), // Token calcolato, non random
    createdAt: Date.now(),
    authorizedAccountIds: new Set(),
  };
  sessions.set(sessionId, session);
  // Persist sessions asynchronously
  writeSessions(sessions).catch(error => console.error('Error saving session:', error));
  return session;
}

function getSession(req, res) {
  const cookies = parseCookies(req.headers.cookie);
  const verifiedId = verifySessionCookie(cookies[SESSION_COOKIE]);
  const session = verifiedId && sessions.has(verifiedId)
    ? sessions.get(verifiedId)
    : createSession(verifiedId || undefined);

  console.log(`[SESSION] Cookie: ${cookies[SESSION_COOKIE]?.slice(0, 20)}..., Verified ID: ${verifiedId?.slice(0, 20)}..., Session exists: ${sessions.has(verifiedId)}, Created new: ${!sessions.has(verifiedId)}`);

  const cookieParts = [
    `${SESSION_COOKIE}=${encodeURIComponent(encodeSessionCookie(session.id))}`,
    'HttpOnly',
    'SameSite=Lax',
    'Path=/',
    'Max-Age=2592000',
  ];

  if (req.socket.encrypted || req.headers['x-forwarded-proto'] === 'https') {
    cookieParts.push('Secure');
  }

  res.setHeader('Set-Cookie', cookieParts.join('; '));
  if (!session.authorizedAccountIds) session.authorizedAccountIds = new Set();
  return session;
}

function assertCsrf(req, session) {
  const token = req.headers['x-csrf-token'];
  // Calcola il token atteso dalla sessionId, così è valido anche dopo restart
  const expected = generateCsrfToken(session.id);
  const valid = token === expected;
  console.log(`[CSRF] Check: received="${token?.slice(0, 10)}...", expected="${expected?.slice(0, 10)}...", valid=${valid}`);
  return valid;
}

function authorizeAccount(session, accountId) {
  if (!session.authorizedAccountIds) session.authorizedAccountIds = new Set();
  session.authorizedAccountIds.add(accountId);
  // Persist sessions asynchronously
  writeSessions(sessions).catch(error => console.error('Error saving session:', error));
}

function canAccessAccount(session, accountId) {
  return Boolean(session.authorizedAccountIds && session.authorizedAccountIds.has(accountId));
}

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

async function readUsers() {
  try {
    const raw = await fs.readFile(USERS_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    throw error;
  }
}

async function writeUsers(users) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const tmp = `${USERS_FILE}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(users, null, 2));
  await fs.rename(tmp, USERS_FILE);
}

async function readSessions() {
  try {
    const raw = await fs.readFile(SESSIONS_FILE, 'utf8');
    const data = JSON.parse(raw);
    // Convert authorizedAccountIds back to Set
    for (const session of Object.values(data)) {
      if (session.authorizedAccountIds) {
        session.authorizedAccountIds = new Set(session.authorizedAccountIds);
      }
    }
    return data;
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    throw error;
  }
}

async function writeSessions(sessions) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const data = {};
  for (const [id, session] of sessions) {
    data[id] = {
      ...session,
      // Convert Set to array for JSON serialization
      authorizedAccountIds: session.authorizedAccountIds ? Array.from(session.authorizedAccountIds) : [],
    };
  }
  const tmp = `${SESSIONS_FILE}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 2));
  await fs.rename(tmp, SESSIONS_FILE);
}

function normalizeDisplayName(value = '') {
  return String(value).trim().replace(/\s+/g, ' ');
}

function normalizedLookup(value = '') {
  return normalizeDisplayName(value).toLocaleLowerCase('it-IT');
}

function safeAccountId(value = '') {
  const id = String(value).trim();
  return /^[a-zA-Z0-9_-]{1,120}$/.test(id) ? id : '';
}

function safeStorageKey(value = '') {
  const key = String(value).trim();
  return /^[a-zA-Z0-9_-]{1,180}$/.test(key) ? key : '';
}

function isoDateOrNull(value) {
  const time = Date.parse(value || '');
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

function sanitizePasswordRecord(record = {}) {
  const algorithm = record.algorithm === 'pbkdf2-sha256' || record.algorithm === 'fallback-hash'
    ? record.algorithm
    : '';
  const salt = String(record.salt || '').slice(0, 256);
  const hash = String(record.hash || '').slice(0, 512);
  const iterations = Math.max(1, Math.min(1000000, Number(record.iterations) || 1));

  if (!algorithm || !salt || !hash) return null;
  return { algorithm, salt, hash, iterations };
}

function fallbackHash(password, salt) {
  const text = `${salt}:${password}`;
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function constantTimeStringEqual(a = '', b = '') {
  const first = Buffer.from(String(a));
  const second = Buffer.from(String(b));
  if (first.length !== second.length) return false;
  return crypto.timingSafeEqual(first, second);
}

function passwordHashForRecord(password, record) {
  if (record.algorithm === 'pbkdf2-sha256') {
    return crypto.pbkdf2Sync(
      String(password || ''),
      Buffer.from(record.salt, 'base64'),
      record.iterations || 120000,
      32,
      'sha256'
    ).toString('base64');
  }

  return fallbackHash(String(password || ''), record.salt);
}

function verifyPasswordRecord(password, record) {
  const cleanRecord = sanitizePasswordRecord(record);
  if (!cleanRecord) return false;
  return constantTimeStringEqual(passwordHashForRecord(password, cleanRecord), cleanRecord.hash);
}

function sanitizeSyncAccount(account = {}) {
  const id = safeAccountId(account.id);
  const displayName = normalizeDisplayName(account.displayName).slice(0, 80);
  const storageKey = safeStorageKey(account.storageKey);
  const password = sanitizePasswordRecord(account.password);

  if (!id || displayName.length < 2 || !storageKey || !password) return null;

  return {
    id,
    displayName,
    normalizedName: normalizedLookup(account.normalizedName || displayName),
    storageKey,
    password,
    createdAt: isoDateOrNull(account.createdAt) || new Date().toISOString(),
    lastLoginAt: isoDateOrNull(account.lastLoginAt),
    authToken: String(account.authToken || '').slice(0, 128),
  };
}

function accountRecordTime(account = {}) {
  const time = Date.parse(account.lastLoginAt || account.createdAt || '');
  return Number.isFinite(time) ? time : 0;
}

function mergeAccountRecord(current, next) {
  if (!current) return next;
  if (accountRecordTime(next) >= accountRecordTime(current)) {
    return {
      ...current,
      ...next,
      createdAt: current.createdAt || next.createdAt,
      lastLoginAt: next.lastLoginAt || current.lastLoginAt,
    };
  }
  return {
    ...next,
    ...current,
    createdAt: next.createdAt || current.createdAt,
    lastLoginAt: current.lastLoginAt || next.lastLoginAt,
  };
}

function mergeSyncAccounts(existing = [], incoming = []) {
  const byId = new Map();
  [...existing, ...incoming]
    .map(sanitizeSyncAccount)
    .filter(Boolean)
    .forEach(account => {
      byId.set(account.id, mergeAccountRecord(byId.get(account.id), account));
    });

  const byName = new Map();
  [...byId.values()].forEach(account => {
    byName.set(account.normalizedName, mergeAccountRecord(byName.get(account.normalizedName), account));
  });

  return [...byName.values()]
    .sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
}

async function readSyncAccounts() {
  try {
    const raw = await fs.readFile(SYNC_ACCOUNTS_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    const accounts = Array.isArray(parsed) ? parsed : parsed.accounts;
    return mergeSyncAccounts([], Array.isArray(accounts) ? accounts : []);
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

async function writeSyncAccounts(accounts) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const tmp = `${SYNC_ACCOUNTS_FILE}.tmp`;
  await fs.writeFile(tmp, JSON.stringify({ schemaVersion: 1, accounts }, null, 2));
  await fs.rename(tmp, SYNC_ACCOUNTS_FILE);
}

function stateFileForAccount(accountId) {
  const safeId = safeAccountId(accountId);
  if (!safeId) {
    const error = new Error('Account non valido');
    error.status = 400;
    throw error;
  }
  return path.join(SYNC_STATE_DIR, `${safeId}.json`);
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

async function readSyncState(accountId) {
  try {
    const raw = await fs.readFile(stateFileForAccount(accountId), 'utf8');
    const parsed = JSON.parse(raw);
    return {
      exists: true,
      state: sanitizeSyncState(parsed.state || parsed),
    };
  } catch (error) {
    if (error.code === 'ENOENT') return { exists: false, state: null };
    throw error;
  }
}

async function writeSyncState(accountId, state) {
  const cleanState = sanitizeSyncState(state);
  await fs.mkdir(SYNC_STATE_DIR, { recursive: true });
  const file = stateFileForAccount(accountId);
  const tmp = `${file}.tmp`;
  await fs.writeFile(tmp, JSON.stringify({ schemaVersion: 1, state: cleanState }, null, 2));
  await fs.rename(tmp, file);
  return cleanState;
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
    map.set(id, {
      ...item,
      type: item.type === 'income' ? 'income' : 'expense',
      frequency: item.frequency === 'yearly' ? 'yearly' : 'monthly',
    });
  });
  return [...map.values()];
}

function isFixedSource(source) {
  return source === 'monthly' || source === 'yearly';
}

function monthlyOverview(transactions) {
  const fixedIncome = transactions
    .filter(tx => tx.type === 'income' && isFixedSource(tx.source))
    .reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
  const variableIncome = transactions
    .filter(tx => tx.type === 'income' && !isFixedSource(tx.source))
    .reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
  const savings = transactions
    .filter(tx => tx.type === 'expense' && tx.category === 'salvadanaio')
    .reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
  const fixedExpenses = transactions
    .filter(tx => tx.type === 'expense' && isFixedSource(tx.source) && tx.category !== 'salvadanaio')
    .reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
  const variableExpenses = transactions
    .filter(tx => tx.type === 'expense' && !isFixedSource(tx.source) && tx.category !== 'salvadanaio')
    .reduce((sum, tx) => sum + Number(tx.amount || 0), 0);

  return {
    fixedIncome,
    variableIncome,
    fixedExpenses,
    variableExpenses,
    savings,
    liquidMoney: fixedIncome + variableIncome - fixedExpenses - variableExpenses - savings,
  };
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
  const fixedIncomePlanned = recurringEntries
    .filter(item => item.active !== false && item.type === 'income')
    .reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const fixedPlanned = recurringEntries
    .filter(item => item.active !== false && item.type === 'expense' && item.category !== 'salvadanaio')
    .reduce((sum, item) => sum + Number(item.amount || 0), 0);
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

  if (income <= 0 && expense > 0) {
    score -= 25;
    reasoning.push('Ci sono spese senza entrate nel mese: il saldo non rappresenta ancora un budget completo.');
    actions.push('Aggiungi le entrate ricorrenti prima di prendere decisioni sui tagli.');
  } else if (expenseRate >= 0.9) {
    score -= 24;
    reasoning.push(`Le spese assorbono ${formatPercent(expenseRate)} delle entrate: margine di sicurezza molto basso.`);
    actions.push('Imposta un tetto settimanale sulle spese manuali fino a riportare il rapporto sotto il 75%.');
  } else if (expenseRate >= 0.75) {
    score -= 10;
    reasoning.push(`Le spese assorbono ${formatPercent(expenseRate)} delle entrate: gestione sostenibile ma fragile.`);
    actions.push('Riduci prima le categorie variabili, non le spese essenziali.');
  } else if (income > 0) {
    score += 6;
    reasoning.push(`Il rapporto spese/entrate e ${formatPercent(expenseRate)}: resta spazio per risparmio o fondo emergenza.`);
  }

  if (balance < 0) {
    score -= 18;
    reasoning.push('Il saldo mensile e negativo: le uscite superano le entrate registrate.');
    actions.push('Blocca nuove spese non essenziali finche il saldo mensile torna positivo.');
  }

  if (fixedRate > 0.5) {
    score -= 12;
    reasoning.push(`Le spese fisse pianificate pesano ${formatPercent(fixedRate)} delle entrate: il budget e poco flessibile.`);
    actions.push('Rinegozia o sostituisci almeno una spesa fissa ad alto importo.');
  } else if (fixedPlanned > 0 && income > 0) {
    reasoning.push(`Spese fisse pianificate: ${formatCurrency(fixedPlanned, settings)} (${formatPercent(fixedRate)} delle entrate).`);
  }

  if (fixedIncomePlanned > 0) {
    reasoning.push(`Entrate fisse pianificate: ${formatCurrency(fixedIncomePlanned, settings)}. Liquidita libera stimata nel mese: ${formatCurrency(overview.liquidMoney, settings)}.`);
  }

  if (topCategory && expense > 0 && topCategory.total / expense > 0.35) {
    reasoning.push(`La categoria piu pesante e ${topCategory.category}: ${formatCurrency(topCategory.total, settings)}.`);
    actions.push(`Controlla le ultime voci in "${topCategory.category}" e cerca una riduzione mirata del 5-10%.`);
  }

  if (manualExpense > fixedPaid && manualExpense > 0) {
    reasoning.push(`Spese manuali del mese: ${formatCurrency(manualExpense, settings)} contro ${formatCurrency(fixedPaid, settings)} gia generate da spese mensili.`);
  }

  if (String(question).toLowerCase().includes('dati')) {
    actions.push('Per dati sensibili usa il backend locale e non inserire credenziali bancarie nell app.');
  }

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

async function handleApi(req, res, url) {
  const session = getSession(req, res);

  if (req.method === 'OPTIONS') {
    res.writeHead(204, baseHeaders({ Allow: 'GET,POST,PUT,DELETE,OPTIONS' }));
    res.end();
    return;
  }
  
  const pathClean = url.pathname.replace(/\/$/, '');
  console.log(`[API] ${req.method} ${pathClean}`);

  if (pathClean === '/api/health' && req.method === 'GET') {
    sendJson(res, 200, { ok: true, service: 'finanza-personale-backend' });
    return;
  }

  if (pathClean === '/api/session' && req.method === 'GET') {
    sendJson(res, 200, { ok: true, csrfToken: session.csrfToken });
    return;
  }

  if (pathClean === '/api/profile' && req.method === 'GET') {
    const users = await readUsers();
    sendJson(res, 200, sanitizeProfile(users[session.userId] || {}));
    return;
  }

  if (pathClean === '/api/profile' && req.method === 'PUT') {
    if (!assertCsrf(req, session)) {
      sendJson(res, 403, { error: 'Token CSRF non valido' });
      return;
    }

    const body = await readBody(req);
    const users = await readUsers();
    users[session.userId] = sanitizeProfile(body);
    await writeUsers(users);
    sendJson(res, 200, users[session.userId]);
    return;
  }

  if (pathClean === '/api/sync/accounts' && req.method === 'GET') {
    const accounts = await readSyncAccounts();
    sendJson(res, 200, { schemaVersion: 1, accounts });
    return;
  }

  if (pathClean === '/api/sync/accounts' && req.method === 'PUT') {
    if (!assertCsrf(req, session)) {
      sendJson(res, 403, { error: 'Token CSRF non valido' });
      return;
    }

    const body = await readBody(req);
    const existing = await readSyncAccounts();
    const incoming = Array.isArray(body.accounts) ? body.accounts : [];
    const accounts = mergeSyncAccounts(existing, incoming).slice(0, 50);
    await writeSyncAccounts(accounts);
    sendJson(res, 200, { schemaVersion: 1, accounts });
    return;
  }

  if (pathClean === '/api/sync/account' && req.method === 'DELETE') {
    if (!assertCsrf(req, session)) {
      sendJson(res, 403, { error: 'Token CSRF non valido' });
      return;
    }

    const accountId = url.searchParams.get('id');
    const existing = await readSyncAccounts();
    const updated = existing.filter(a => a.id !== accountId);
    await writeSyncAccounts(updated);
    
    try {
      await fs.unlink(stateFileForAccount(accountId));
    } catch(e) {}
    
    sendJson(res, 200, { success: true });
    return;
  }

  if (pathClean === '/api/sync/login' && req.method === 'POST') {
    if (!assertCsrf(req, session)) {
      sendJson(res, 403, { error: 'Token CSRF non valido' });
      return;
    }

    const body = await readBody(req);
    const lookup = normalizedLookup(body.identifier);
    const accounts = await readSyncAccounts();
    const account = accounts.find(item => item.id === body.identifier || item.normalizedName === lookup);

    if (!account || !verifyPasswordRecord(body.password, account.password)) {
      sendJson(res, 401, { error: 'Password non corretta.' });
      return;
    }

    account.lastLoginAt = new Date().toISOString();
    if (!account.authToken) {
      account.authToken = crypto.randomBytes(32).toString('hex');
    }
    await writeSyncAccounts(accounts);
    authorizeAccount(session, account.id);
    sendJson(res, 200, { account });
    return;
  }

  if (pathClean === '/api/sync/authorize' && req.method === 'POST') {
    if (!assertCsrf(req, session)) {
      sendJson(res, 403, { error: 'Token CSRF non valido' });
      return;
    }

    const body = await readBody(req);
    const accounts = await readSyncAccounts();
    const account = accounts.find(item => item.id === body.accountId);

    if (!account || !account.authToken || account.authToken !== body.authToken) {
      sendJson(res, 401, { error: 'Token di autorizzazione non valido.' });
      return;
    }

    authorizeAccount(session, account.id);
    sendJson(res, 200, { success: true });
    return;
  }

  if (pathClean === '/api/sync/state' && req.method === 'GET') {
    const accountId = url.searchParams.get('accountId');
    if (!canAccessAccount(session, accountId)) {
      sendJson(res, 403, { error: 'Accedi all account prima di sincronizzare i dati.' });
      return;
    }
    const state = await readSyncState(accountId);
    sendJson(res, 200, state);
    return;
  }

  if (pathClean === '/api/sync/state' && req.method === 'PUT') {
    if (!assertCsrf(req, session)) {
      sendJson(res, 403, { error: 'Token CSRF non valido' });
      return;
    }

    const body = await readBody(req, MAX_SYNC_STATE_BYTES);
    if (!canAccessAccount(session, body.accountId)) {
      sendJson(res, 403, { error: 'Accedi all account prima di sincronizzare i dati.' });
      return;
    }
    const state = await writeSyncState(body.accountId, body.state);
    sendJson(res, 200, { exists: true, state });
    return;
  }

  if (pathClean === '/api/assistant/analyze' && req.method === 'POST') {
    if (!assertCsrf(req, session)) {
      sendJson(res, 403, { error: 'Token CSRF non valido' });
      return;
    }

    const body = await readBody(req);
    sendJson(res, 200, {
      reply: buildAssistantReply(body.question, body.state),
    });
    return;
  }

  sendJson(res, 404, { error: 'Endpoint non trovato' });
}

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
  // Load persisted sessions
  readSessions().then(persistedSessions => {
    for (const [id, session] of Object.entries(persistedSessions)) {
      sessions.set(id, session);
    }
    console.log(`Loaded ${sessions.size} persisted sessions`);
  }).catch(error => {
    console.error('Error loading sessions:', error);
  });

  server.listen(PORT, HOST, () => {
    const displayHost = HOST === '0.0.0.0' ? '<IP-locale>' : HOST;
    console.log(`FinanzaPersonale backend: http://${displayHost}:${PORT}`);
  });
}

module.exports = { server, buildAssistantReply };
