/**
 * auth-accounts.js - Nuovo sistema di gestione Account/Profili (2.0)
 * 
 * Architettura:
 * - Account: Email + Password (login super admin)
 * - Profilo: Username + Password per account (login profilo)
 * - Dati finanziari: Salvati per account/profilo
 * 
 * Backwards Compatibility:
 * - Account vecchi migrati automaticamente come Account + Profilo Default
 * - storageKey preservato ma mappato a profileId
 */

import { 
  authorizeSyncedAccount, 
  deleteSyncedAccount, 
  getSyncedAccounts, 
  loginSyncedAccount, 
  saveSyncedAccounts 
} from '../utils/backendClient.js';

// LocalStorage Keys
export const ACCOUNTS_LIST_KEY = 'finanza:accounts-v2'; // Lista di account (id, email, defaultProfileId)
export const ACCOUNT_DATA_KEY = (accountId) => `finanza:account:${accountId}`; // Dati account (email hash, profili)
export const ACTIVE_ACCOUNT_KEY = 'finanza:active-account-v2'; // Account attualmente selezionato
export const ACTIVE_PROFILE_KEY = 'finanza:active-profile-v2'; // Profilo attualmente selezionato

const PASSWORD_MIN_LENGTH = 8;
const PBKDF2_ITERATIONS = 120000;
const PBKDF2_ALGORITHM = 'pbkdf2-sha256';
const FALLBACK_ALGORITHM = 'fallback-hash';

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

const clone = value => JSON.parse(JSON.stringify(value));

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : clone(fallback);
  } catch (error) {
    console.error('[Auth-Accounts] Errore lettura localStorage:', error);
    return clone(fallback);
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.error('[Auth-Accounts] Errore scrittura localStorage:', error);
  }
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
  
  if (!canUseSubtleCrypto()) {
    console.warn('[Auth-Accounts] SubtleCrypto non disponibile. Utilizzo fallbackHash.');
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

function normalizeEmail(email) {
  return String(email).trim().toLowerCase();
}

function normalizeName(value = '') {
  return String(value).trim().replace(/\s+/g, ' ');
}

function normalizedLookup(value = '') {
  return normalizeName(value).toLocaleLowerCase('it-IT');
}

// ============================================================================
// ACCOUNT STRUCTURE FUNCTIONS
// ============================================================================

/**
 * Struttura Account:
 * {
 *   id: UUID,
 *   email: string,
 *   password: PasswordRecord,
 *   profileIds: [UUID...],
 *   defaultProfileId: UUID | null,
 *   createdAt: ISO,
 *   lastLoginAt: ISO
 * }
 */

function normalizeAccount(account) {
  if (!account || typeof account !== 'object') return null;
  
  const id = String(account.id || '').trim();
  const email = normalizeEmail(account.email || '');
  const profileIds = Array.isArray(account.profileIds) ? account.profileIds : [];
  
  if (!id || !email || !account.password) return null;
  
  return {
    id,
    email,
    password: account.password,
    profileIds,
    defaultProfileId: account.defaultProfileId || null,
    createdAt: account.createdAt || new Date().toISOString(),
    lastLoginAt: account.lastLoginAt || null,
  };
}

function readAccountsList() {
  const raw = readJson(ACCOUNTS_LIST_KEY, { schemaVersion: 2, accounts: [] });
  const accounts = Array.isArray(raw) ? raw : raw.accounts;
  return (Array.isArray(accounts) ? accounts : [])
    .map(normalizeAccount)
    .filter(Boolean);
}

function saveAccountsList(accounts) {
  writeJson(ACCOUNTS_LIST_KEY, {
    schemaVersion: 2,
    accounts,
  });
}

function readAccountData(accountId) {
  return readJson(ACCOUNT_DATA_KEY(accountId), { profiles: [] });
}

function saveAccountData(accountId, data) {
  writeJson(ACCOUNT_DATA_KEY(accountId), data);
}

// ============================================================================
// PROFILE STRUCTURE FUNCTIONS
// ============================================================================

/**
 * Struttura Profile:
 * {
 *   id: UUID,
 *   username: string,
 *   password: PasswordRecord,
 *   currency: 'EUR'|'USD'|'GBP'|'CHF',
 *   locale: 'it-IT'|'en-US'|'de-DE'|'fr-FR',
 *   storageKey: string (per dati finanziari),
 *   createdAt: ISO,
 *   syncedAt: ISO | null
 * }
 */

function normalizeProfile(profile) {
  if (!profile || typeof profile !== 'object') return null;
  
  const id = String(profile.id || '').trim();
  const username = normalizeName(profile.username || '');
  const currency = profile.currency || 'EUR';
  const locale = profile.locale || 'it-IT';
  const storageKey = profile.storageKey || '';
  
  if (!id || !username || !profile.password) return null;
  
  return {
    id,
    username,
    password: profile.password,
    currency,
    locale,
    storageKey,
    createdAt: profile.createdAt || new Date().toISOString(),
    syncedAt: profile.syncedAt || null,
  };
}

function readProfiles(accountId) {
  const data = readAccountData(accountId);
  const profiles = Array.isArray(data.profiles) ? data.profiles : [];
  return profiles
    .map(normalizeProfile)
    .filter(Boolean);
}

function saveProfiles(accountId, profiles) {
  const data = readAccountData(accountId);
  data.profiles = profiles;
  saveAccountData(accountId, data);
}

// ============================================================================
// PUBLIC API
// ============================================================================

export async function registerAccount({ email, password, profileUsername, profilePassword, currency = 'EUR', locale = 'it-IT' }) {
  const cleanEmail = normalizeEmail(email);
  const cleanPassword = assertPassword(password);
  const cleanUsername = assertUsername(profileUsername);
  const cleanProfilePassword = assertPassword(profilePassword);
  
  if (cleanEmail.length < 5 || !cleanEmail.includes('@')) {
    throw new Error('Email non valida.');
  }
  
  // Check if account already exists
  const accounts = readAccountsList();
  if (accounts.some(a => a.email === cleanEmail)) {
    throw new Error('Un account con questa email esiste già.');
  }
  
  const now = new Date().toISOString();
  const accountId = generateId();
  const profileId = generateId();
  
  // Create account
  const account = {
    id: accountId,
    email: cleanEmail,
    password: await createPasswordRecord(cleanPassword),
    profileIds: [profileId],
    defaultProfileId: profileId,
    createdAt: now,
    lastLoginAt: now,
  };
  
  // Create first profile
  const profile = {
    id: profileId,
    username: cleanUsername,
    password: await createPasswordRecord(cleanProfilePassword),
    currency: currency,
    locale: locale,
    storageKey: `finanza:profile:${accountId}:${profileId}`,
    createdAt: now,
    syncedAt: null,
  };
  
  // Save account and profile
  accounts.push(account);
  saveAccountsList(accounts);
  
  const data = { profiles: [profile] };
  saveAccountData(accountId, data);
  
  // Set as active
  setActiveAccountId(accountId);
  setActiveProfileId(profileId);
  
  // Try backend sync
  try {
    await loginSyncedAccount(cleanEmail, cleanPassword);
  } catch (error) {
    console.warn('[Auth-Accounts] Backend sync failed (non-blocking):', error);
  }
  
  return { account, profile };
}

export async function loginAccount({ email, password }) {
  const cleanEmail = normalizeEmail(email);
  const cleanPassword = assertPassword(password);
  
  // Sync accounts from backend
  try {
    await syncAccountsWithBackend();
  } catch (error) {
    console.warn('[Auth-Accounts] Backend sync failed:', error);
  }
  
  const accounts = readAccountsList();
  const account = accounts.find(a => a.email === cleanEmail);
  
  if (!account) {
    throw new Error('Account non trovato.');
  }
  
  let verified = false;
  try {
    const hash = await hashForRecord(cleanPassword, account.password);
    verified = constantTimeEqual(hash, account.password.hash);
  } catch (error) {
    console.error('[Auth-Accounts] Local password verification failed:', error);
  }
  
  if (!verified) {
    // Try backend login
    try {
      const backendResult = await loginSyncedAccount(cleanEmail, cleanPassword);
      if (!backendResult.available) {
        throw new Error(backendResult.error || 'Password non corretta.');
      }
    } catch (error) {
      throw new Error('Password non corretta.');
    }
  }
  
  // Update lastLoginAt
  account.lastLoginAt = new Date().toISOString();
  const index = accounts.findIndex(a => a.id === account.id);
  accounts[index] = account;
  saveAccountsList(accounts);
  
  setActiveAccountId(account.id);
  
  // Return profiles for this account
  const profiles = readProfiles(account.id);
  
  return { account, profiles };
}

export async function createProfile(accountId, { username, password, currency = 'EUR', locale = 'it-IT' }) {
  const cleanUsername = assertUsername(username);
  const cleanPassword = assertPassword(password);
  
  const accounts = readAccountsList();
  const account = accounts.find(a => a.id === accountId);
  
  if (!account) {
    throw new Error('Account non trovato.');
  }
  
  // Check username doesn't exist in this account
  const profiles = readProfiles(accountId);
  if (profiles.some(p => p.username === cleanUsername)) {
    throw new Error('Un profilo con questo username esiste già in questo account.');
  }
  
  const now = new Date().toISOString();
  const profileId = generateId();
  
  const profile = {
    id: profileId,
    username: cleanUsername,
    password: await createPasswordRecord(cleanPassword),
    currency,
    locale,
    storageKey: `finanza:profile:${accountId}:${profileId}`,
    createdAt: now,
    syncedAt: null,
  };
  
  // Add profile to account
  account.profileIds.push(profileId);
  
  const index = accounts.findIndex(a => a.id === accountId);
  accounts[index] = account;
  saveAccountsList(accounts);
  
  // Save profile
  profiles.push(profile);
  saveProfiles(accountId, profiles);
  
  return profile;
}

export async function loginProfile(accountId, { username, password }) {
  const cleanPassword = assertPassword(password);
  
  const accounts = readAccountsList();
  const account = accounts.find(a => a.id === accountId);
  
  if (!account) {
    throw new Error('Account non trovato.');
  }
  
  const profiles = readProfiles(accountId);
  const profile = profiles.find(p => p.username === username);
  
  if (!profile) {
    throw new Error('Profilo non trovato.');
  }
  
  // Verify password
  let verified = false;
  try {
    const hash = await hashForRecord(cleanPassword, profile.password);
    verified = constantTimeEqual(hash, profile.password.hash);
  } catch (error) {
    console.error('[Auth-Accounts] Profile password verification failed:', error);
  }
  
  if (!verified) {
    throw new Error('Password profilo non corretta.');
  }
  
  // Set as active
  setActiveAccountId(accountId);
  setActiveProfileId(profile.id);
  
  return profile;
}

export function getActiveAccount() {
  const accountId = localStorage.getItem(ACTIVE_ACCOUNT_KEY);
  if (!accountId) return null;
  
  const accounts = readAccountsList();
  return accounts.find(a => a.id === accountId);
}

export function getActiveProfile() {
  const accountId = localStorage.getItem(ACTIVE_ACCOUNT_KEY);
  const profileId = localStorage.getItem(ACTIVE_PROFILE_KEY);
  
  if (!accountId || !profileId) return null;
  
  const profiles = readProfiles(accountId);
  return profiles.find(p => p.id === profileId);
}

export function listAccountsSummary() {
  return readAccountsList().map(account => ({
    id: account.id,
    email: account.email,
    profileCount: account.profileIds.length,
    defaultProfileId: account.defaultProfileId,
    lastLoginAt: account.lastLoginAt,
  }));
}

export function listProfilesForAccount(accountId) {
  return readProfiles(accountId);
}

export function setActiveAccountId(accountId) {
  localStorage.setItem(ACTIVE_ACCOUNT_KEY, String(accountId));
}

export function setActiveProfileId(profileId) {
  localStorage.setItem(ACTIVE_PROFILE_KEY, String(profileId));
}

export function setDefaultProfile(accountId, profileId) {
  const accounts = readAccountsList();
  const account = accounts.find(a => a.id === accountId);
  
  if (!account) {
    throw new Error('Account non trovato.');
  }
  
  if (!account.profileIds.includes(profileId)) {
    throw new Error('Profilo non trovato in questo account.');
  }
  
  account.defaultProfileId = profileId;
  const index = accounts.findIndex(a => a.id === accountId);
  accounts[index] = account;
  saveAccountsList(accounts);
}

export function logoutProfile() {
  localStorage.removeItem(ACTIVE_PROFILE_KEY);
}

export function logoutAccount() {
  localStorage.removeItem(ACTIVE_ACCOUNT_KEY);
  localStorage.removeItem(ACTIVE_PROFILE_KEY);
}

export async function deleteAccount(accountId) {
  const activeId = localStorage.getItem(ACTIVE_ACCOUNT_KEY);
  if (activeId === accountId) {
    logoutAccount();
  }
  
  let accounts = readAccountsList();
  accounts = accounts.filter(a => a.id !== accountId);
  saveAccountsList(accounts);
  
  // Clean storage key
  try {
    const profiles = readProfiles(accountId);
    profiles.forEach(profile => {
      localStorage.removeItem(profile.storageKey);
    });
  } catch (error) {
    console.warn('[Auth-Accounts] Errore pulizia profili:', error);
  }
  
  localStorage.removeItem(ACCOUNT_DATA_KEY(accountId));
  
  // Try backend sync
  try {
    await deleteSyncedAccount(accountId);
  } catch (error) {
    console.warn('[Auth-Accounts] Backend delete failed:', error);
  }
  
  return true;
}

export async function deleteProfile(accountId, profileId) {
  const accounts = readAccountsList();
  const account = accounts.find(a => a.id === accountId);
  
  if (!account) {
    throw new Error('Account non trovato.');
  }
  
  if (!account.profileIds.includes(profileId)) {
    throw new Error('Profilo non trovato.');
  }
  
  const activeId = localStorage.getItem(ACTIVE_PROFILE_KEY);
  if (activeId === profileId) {
    logoutProfile();
  }
  
  account.profileIds = account.profileIds.filter(id => id !== profileId);
  if (account.defaultProfileId === profileId) {
    account.defaultProfileId = account.profileIds.length > 0 ? account.profileIds[0] : null;
  }
  
  const index = accounts.findIndex(a => a.id === accountId);
  accounts[index] = account;
  saveAccountsList(accounts);
  
  // Remove profile
  let profiles = readProfiles(accountId);
  profiles = profiles.filter(p => p.id !== profileId);
  saveProfiles(accountId, profiles);
  
  // Clean storage
  try {
    const profile = readProfiles(accountId).find(p => p.id === profileId);
    if (profile) localStorage.removeItem(profile.storageKey);
  } catch (error) {
    console.warn('[Auth-Accounts] Errore pulizia profilo:', error);
  }
  
  return true;
}

export async function syncAccountsWithBackend() {
  try {
    const result = await getSyncedAccounts();
    if (!result.available) return result;
    
    // Per ora, manteniamo la sincronizzazione semplice
    // Versione completa sincronizzerebbe gli account dal backend
    
    return { available: true };
  } catch (error) {
    console.error('[Auth-Accounts] Backend sync failed:', error);
    return { available: false, error: error.message };
  }
}

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

export function assertEmail(email) {
  const clean = normalizeEmail(email);
  if (clean.length < 5 || !clean.includes('@')) {
    throw new Error('Email non valida.');
  }
  return clean;
}

export function assertPassword(password) {
  const clean = String(password || '');
  if (clean.length < PASSWORD_MIN_LENGTH) {
    throw new Error(`La password deve avere almeno ${PASSWORD_MIN_LENGTH} caratteri.`);
  }
  return clean;
}

export function assertUsername(username) {
  const clean = normalizeName(username);
  if (clean.length < 2) {
    throw new Error('L\'username deve avere almeno 2 caratteri.');
  }
  if (clean.length > 80) {
    throw new Error('L\'username è troppo lungo.');
  }
  return clean;
}
