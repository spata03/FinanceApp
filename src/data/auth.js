/**
 * auth.js - Account locali dell'app.
 *
 * Le password sono salvate come hash quando Web Crypto e disponibile.
 * I dati finanziari restano in localStorage, separati per account.
 */

import { authorizeSyncedAccount, deleteSyncedAccount, getSyncedAccounts, loginSyncedAccount, saveSyncedAccounts } from '../utils/backendClient.js';

export const ACCOUNTS_KEY = 'finanza_personale_accounts_v1';
export const ACTIVE_ACCOUNT_KEY = 'finanza_personale_active_account_v1';
export const LEGACY_STORAGE_KEY = 'finanza_personale_v1';

const PASSWORD_MIN_LENGTH = 8;
const PBKDF2_ITERATIONS = 120000;
const PBKDF2_ALGORITHM = 'pbkdf2-sha256';
const FALLBACK_ALGORITHM = 'fallback-hash';

const clone = value => JSON.parse(JSON.stringify(value));

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : clone(fallback);
  } catch (error) {
    console.error('[Auth] Errore lettura localStorage:', error);
    return clone(fallback);
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.error('[Auth] Errore scrittura localStorage:', error);
  }
}

function normalizeName(value = '') {
  return String(value).trim().replace(/\s+/g, ' ');
}

function normalizedLookup(value = '') {
  return normalizeName(value).toLocaleLowerCase('it-IT');
}

function assertDisplayName(value) {
  const displayName = normalizeName(value);
  if (displayName.length < 2) {
    throw new Error('Inserisci un nome utente di almeno 2 caratteri.');
  }
  if (displayName.length > 80) {
    throw new Error('Il nome utente e troppo lungo.');
  }
  return displayName;
}

function assertPassword(value) {
  const password = String(value || '');
  if (password.length < PASSWORD_MIN_LENGTH) {
    throw new Error(`La password deve avere almeno ${PASSWORD_MIN_LENGTH} caratteri.`);
  }
  return password;
}

function generateId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function randomBytes(length = 16) {
  const bytes = new Uint8Array(length);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
    return bytes;
  }
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = Math.floor(Math.random() * 256);
  }
  return bytes;
}

function toBase64(bytes) {
  let binary = '';
  bytes.forEach(byte => { binary += String.fromCharCode(byte); });
  return btoa(binary);
}

function fromBase64(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
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

function forceFallbackHash() {
  return Boolean(
    typeof window !== 'undefined' &&
    window.__FP_AUTH_FORCE_FALLBACK__ &&
    window.location.pathname.includes('/tests/')
  );
}

function canUseSubtleCrypto() {
  return Boolean(
    typeof crypto !== 'undefined' &&
    crypto.subtle &&
    typeof TextEncoder !== 'undefined'
  );
}

async function pbkdf2Hash(password, salt, iterations) {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: fromBase64(salt),
      iterations,
    },
    keyMaterial,
    256
  );
  return toBase64(new Uint8Array(bits));
}

async function createPasswordRecord(password) {
  const salt = toBase64(randomBytes(18));
  
  if (forceFallbackHash() || !canUseSubtleCrypto()) {
    if (!canUseSubtleCrypto()) {
      console.warn('[Auth] SubtleCrypto non disponibile. Utilizzo fallbackHash per compatibilità (connessione non sicura).');
    }
    return {
      algorithm: FALLBACK_ALGORITHM,
      salt,
      hash: fallbackHash(password, salt),
      iterations: 1,
    };
  }

  return {
    algorithm: PBKDF2_ALGORITHM,
    salt,
    hash: await pbkdf2Hash(password, salt, PBKDF2_ITERATIONS),
    iterations: PBKDF2_ITERATIONS,
  };
}

async function hashForRecord(password, record) {
  if (!record || !record.algorithm || !record.salt) {
    throw new Error('Account non valido.');
  }

  if (record.algorithm === PBKDF2_ALGORITHM) {
    if (!canUseSubtleCrypto()) {
      throw new Error('Questo browser richiede una connessione sicura per verificare la password.');
    }
    return pbkdf2Hash(password, record.salt, record.iterations || PBKDF2_ITERATIONS);
  }

  return fallbackHash(password, record.salt);
}

function constantTimeEqual(a = '', b = '') {
  const max = Math.max(a.length, b.length);
  let mismatch = a.length === b.length ? 0 : 1;
  for (let i = 0; i < max; i += 1) {
    mismatch |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return mismatch === 0;
}

function normalizeAccount(account) {
  if (!account || typeof account !== 'object') return null;
  const id = String(account.id || '').trim();
  const displayName = normalizeName(account.displayName);
  const storageKey = String(account.storageKey || '').trim();
  if (!id || !displayName || !storageKey || !account.password) return null;

  return {
    id,
    displayName,
    normalizedName: account.normalizedName || normalizedLookup(displayName),
    storageKey,
    password: account.password,
    createdAt: account.createdAt || new Date().toISOString(),
    lastLoginAt: account.lastLoginAt || null,
    authToken: account.authToken || null,
  };
}

function readAccounts() {
  const raw = readJson(ACCOUNTS_KEY, { schemaVersion: 1, accounts: [] });
  const accounts = Array.isArray(raw) ? raw : raw.accounts;
  return (Array.isArray(accounts) ? accounts : [])
    .map(normalizeAccount)
    .filter(Boolean);
}

function saveAccounts(accounts) {
  writeJson(ACCOUNTS_KEY, {
    schemaVersion: 1,
    accounts,
  });
}

function accountTime(account) {
  const value = Date.parse(account?.lastLoginAt || account?.createdAt || '');
  return Number.isFinite(value) ? value : 0;
}

function mergeAccountRecords(current, next) {
  if (!current) return next;
  if (accountTime(next) >= accountTime(current)) {
    return {
      ...current,
      ...next,
      lastLoginAt: next.lastLoginAt || current.lastLoginAt,
      createdAt: current.createdAt || next.createdAt,
    };
  }
  return {
    ...next,
    ...current,
    lastLoginAt: current.lastLoginAt || next.lastLoginAt,
    createdAt: next.createdAt || current.createdAt,
  };
}

function serializeAccounts(accounts) {
  return JSON.stringify(
    accounts
      .map(normalizeAccount)
      .filter(Boolean)
      .sort((a, b) => a.id.localeCompare(b.id))
  );
}

function accountsEqual(a, b) {
  return serializeAccounts(a) === serializeAccounts(b);
}

function mergeAccountLists(localAccounts = [], remoteAccounts = []) {
  const map = new Map();
  // Inseriamo prima i remoti (sono la verità per gli account già sincronizzati)
  remoteAccounts.forEach(a => {
    const clean = normalizeAccount(a);
    if (clean) map.set(clean.id, clean);
  });
  
  // Aggiungiamo i locali solo se non sono già presenti (per evitare duplicati)
  // o se sono account puramente locali (non ancora sincronizzati)
  localAccounts.forEach(a => {
    const local = normalizeAccount(a);
    if (!local) return;

    if (!map.has(local.id)) {
      // Se l'account era già stato sincronizzato (ha authToken) ma non è nel remoto,
      // significa che è stato eliminato dal server. Lo ignoriamo (lo eliminiamo localmente).
      const wasSynced = local.authToken || (local.storageKey && local.storageKey.includes('_user_'));
      if (!wasSynced) {
        map.set(local.id, local);
      }
    } else {
      // Se presente in entrambi, uniamo i dati locali (password, ecc) a quelli remoti
      const remote = map.get(local.id);
      map.set(local.id, mergeAccountRecords(local, remote));
    }
  });

  return [...map.values()]
    .sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
}

let accountSyncPromise = null;

async function pushAccountsToBackend(accounts = readAccounts()) {
  const result = await saveSyncedAccounts(accounts);
  if (!result.available) return result;

  const merged = mergeAccountLists(accounts, result.accounts || []);
  if (!accountsEqual(merged, accounts)) {
    saveAccounts(merged);
  }
  return { ...result, accounts: merged };
}

export async function syncAccountsWithBackend({ force = false } = {}) {
  if (accountSyncPromise && !force) return accountSyncPromise;

  accountSyncPromise = (async () => {
    const localAccounts = readAccounts();
    const result = await getSyncedAccounts();
    if (!result.available) {
      return { available: false, error: result.error, accounts: localAccounts };
    }

    const remoteAccounts = (result.accounts || [])
      .map(normalizeAccount)
      .filter(Boolean);
    const merged = mergeAccountLists(localAccounts, remoteAccounts);

    if (!accountsEqual(merged, localAccounts)) {
      saveAccounts(merged);
    }

    return { available: true, accounts: merged };
  })().finally(() => {
    accountSyncPromise = null;
  });

  return accountSyncPromise;
}

function publicAccount(account) {
  if (!account) return null;
  return {
    id: account.id,
    displayName: account.displayName,
    storageKey: account.storageKey,
    createdAt: account.createdAt,
    lastLoginAt: account.lastLoginAt,
    hasAuthToken: Boolean(account.authToken),
  };
}

function setActiveAccountId(id) {
  localStorage.setItem(ACTIVE_ACCOUNT_KEY, String(id));
}

function storageKeyForNewAccount(accounts, id) {
  if (accounts.length === 0) return LEGACY_STORAGE_KEY;
  return `${LEGACY_STORAGE_KEY}_user_${String(id).replace(/[^a-zA-Z0-9_-]/g, '')}`;
}

export function listAccounts() {
  return readAccounts().map(publicAccount);
}

export function getActiveAccount() {
  const activeId = localStorage.getItem(ACTIVE_ACCOUNT_KEY);
  if (!activeId) return null;
  return publicAccount(readAccounts().find(account => account.id === activeId));
}

export function getActiveStorageKey() {
  return getActiveAccount()?.storageKey || LEGACY_STORAGE_KEY;
}

export async function registerAccount({ displayName, password }) {
  const cleanName = assertDisplayName(displayName);
  const cleanPassword = assertPassword(password);
  await syncAccountsWithBackend();
  const accounts = readAccounts();
  const lookup = normalizedLookup(cleanName);

  if (accounts.some(account => account.normalizedName === lookup)) {
    throw new Error('Esiste gia un utente con questo nome.');
  }

  const now = new Date().toISOString();
  const id = generateId();
  const account = {
    id,
    displayName: cleanName,
    normalizedName: lookup,
    storageKey: storageKeyForNewAccount(accounts, id),
    password: await createPasswordRecord(cleanPassword),
    createdAt: now,
    lastLoginAt: now,
  };

  accounts.push(account);
  saveAccounts(accounts);
  setActiveAccountId(account.id);
  const syncResult = await pushAccountsToBackend(accounts);
  if (syncResult.available) {
    await loginSyncedAccount(account.id, cleanPassword);
  }
  return publicAccount(account);
}

export async function loginAccount(identifier, password) {
  const cleanPassword = assertPassword(password);
  await syncAccountsWithBackend();
  const lookup = normalizedLookup(identifier);
  const accounts = readAccounts();
  const account = accounts.find(item => item.id === identifier || item.normalizedName === lookup);

  if (!account) {
    throw new Error('Utente non trovato.');
  }

  let verified = false;
  let localVerificationError = null;
  let backendAuthorized = false;
  try {
    const hash = await hashForRecord(cleanPassword, account.password);
    verified = constantTimeEqual(hash, account.password.hash);
  } catch (error) {
    localVerificationError = error;
  }

  if (!verified) {
    if (!localVerificationError) {
      throw new Error('Password non corretta.');
    }

    const backendResult = await loginSyncedAccount(identifier, cleanPassword);
    if (!backendResult.available || !backendResult.account) {
      throw new Error(backendResult.error || localVerificationError?.message || 'Password non corretta.');
    }

    const syncedAccount = normalizeAccount(backendResult.account);
    if (syncedAccount) {
      const index = accounts.findIndex(item => item.id === syncedAccount.id);
      if (index >= 0) accounts[index] = syncedAccount;
      else accounts.push(syncedAccount);
      account.id = syncedAccount.id;
      account.displayName = syncedAccount.displayName;
      account.normalizedName = syncedAccount.normalizedName;
      account.storageKey = syncedAccount.storageKey;
      account.password = syncedAccount.password;
      account.createdAt = syncedAccount.createdAt;
      account.authToken = syncedAccount.authToken;
    }
    backendAuthorized = true;
    verified = true;
  }

  account.lastLoginAt = new Date().toISOString();
  saveAccounts(accounts);
  setActiveAccountId(account.id);
  if (backendAuthorized) {
    // Se abbiamo appena fatto il login sul backend, non serve rinfrescare subito la lista globale
  } else {
    await loginSyncedAccount(account.id, cleanPassword).catch(console.warn);
  }
  return publicAccount(account);
}

export async function quickSwitchAccount(accountId) {
  const accounts = readAccounts();
  const account = accounts.find(a => a.id === accountId);
  if (!account) throw new Error('Utente non trovato sul dispositivo.');
  
  account.lastLoginAt = new Date().toISOString();
  saveAccounts(accounts);
  setActiveAccountId(account.id);
  
  // Sincronizza lo stato di login col backend ignorando errori di pass
  if (account.authToken) {
    await authorizeSyncedAccount(account.id, account.authToken).catch(console.warn);
  }
  
  return publicAccount(account);
}

export function logoutAccount() {
  localStorage.removeItem(ACTIVE_ACCOUNT_KEY);
}

export async function deleteAccount(accountId) {
  const accounts = readAccounts();
  const account = accounts.find(a => a.id === accountId);
  if (!account) return false;

  // Se stiamo eliminando l'account attivo, effettua il logout PRIMA di rimuoverlo
  const activeId = localStorage.getItem(ACTIVE_ACCOUNT_KEY);
  if (activeId === accountId) {
    logoutAccount();
  }

  // Rimuovi in locale
  const remaining = accounts.filter(a => a.id !== accountId);
  saveAccounts(remaining);

  // Pulisci il suo storage dati
  try {
    localStorage.removeItem(account.storageKey);
  } catch (e) {
    console.warn('[Auth] Errore pulizia storage locale:', e);
  }

  // Rimuovi dal backend (non blocca in caso di errore)
  try {
    await deleteSyncedAccount(accountId);
  } catch (e) {
    console.warn('[Auth] Errore eliminazione backend (account rimosso localmente):', e);
  }

  return true;
}
