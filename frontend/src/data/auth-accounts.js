/**
 * auth-accounts.js - Account/Profile management (v3)
 *
 * Architecture:
 *   Account  → email + password (backend-authenticated)
 *   Profile  → username + password (per-account sub-identity)
 *
 * Backend is the source of truth for auth.
 * localStorage is a cache that survives cold starts and offline mode.
 */

import {
  registerAccount as backendRegister,
  loginAccount as backendLogin,
  selectProfile as backendSelectProfile,
  createProfile as backendCreateProfile,
  deleteProfile as backendDeleteProfile,
  getMe,
  logoutAccount as backendLogout,
} from '../utils/backendClient.js';
import {
  getDeviceTrustToken,
  setDeviceTrustToken,
  clearDeviceTrustForProfile,
} from './device-trust.js';

// ── localStorage keys (v3 — do NOT delete v1/v2 keys) ─────────────────────────
export const ACTIVE_ACCOUNT_KEY_V3  = 'finanza:account-v3';
export const ACTIVE_PROFILE_KEY_V3  = 'finanza:profile-v3';

// Legacy key constants (read-only; do not write to these)
export const ACCOUNTS_LIST_KEY      = 'finanza:accounts-v2';
export const ACTIVE_ACCOUNT_KEY     = 'finanza:active-account-v2';
export const ACTIVE_PROFILE_KEY     = 'finanza:active-profile-v2';

const PASSWORD_MIN_LENGTH = 8;

// ── Utility ────────────────────────────────────────────────────────────────────

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.error('[auth-accounts] localStorage write error:', e);
  }
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function normalizeName(value = '') {
  return String(value).trim().replace(/\s+/g, ' ');
}

// ── Validation exports ─────────────────────────────────────────────────────────

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
  if (clean.length < 2) throw new Error('L\'username deve avere almeno 2 caratteri.');
  if (clean.length > 80) throw new Error('L\'username è troppo lungo.');
  return clean;
}

// ── Active account/profile accessors ──────────────────────────────────────────

/**
 * Returns the active account object from localStorage v3 cache.
 * Shape: { id, email, profiles?: [...] }
 */
export function getActiveAccount() {
  return readJson(ACTIVE_ACCOUNT_KEY_V3, null);
}

/**
 * Returns the active profile object from localStorage v3 cache.
 * Shape: { id, username, currency, locale, storageKey }
 */
export function getActiveProfile() {
  return readJson(ACTIVE_PROFILE_KEY_V3, null);
}

/**
 * Returns all profiles for the active account (from cache).
 */
export function getAccountProfiles() {
  const account = getActiveAccount();
  if (!account || !Array.isArray(account.profiles)) return [];
  return account.profiles;
}

export function setActiveAccountId(accountId) {
  // No-op in v3 — we store full object, but preserve legacy key for auth.js compat
  localStorage.setItem(ACTIVE_ACCOUNT_KEY, String(accountId));
}

export function setActiveProfileId(profileId) {
  localStorage.setItem(ACTIVE_PROFILE_KEY, String(profileId));
}

// ── Auth operations ────────────────────────────────────────────────────────────

/**
 * Register a new account + first profile on the backend.
 * Saves result to localStorage v3.
 */
export async function registerAccount({ email, password, profileUsername, profilePassword, currency = 'EUR', locale = 'it-IT' }) {
  const cleanEmail = assertEmail(email);
  assertPassword(password);
  assertUsername(profileUsername);
  assertPassword(profilePassword);

  const result = await backendRegister(cleanEmail, password, profileUsername, profilePassword, currency, locale);

  // Cache account and profile
  const accountCache = {
    id: result.account.id,
    email: result.account.email,
    createdAt: result.account.createdAt,
    profiles: [result.profile],
  };
  writeJson(ACTIVE_ACCOUNT_KEY_V3, accountCache);
  writeJson(ACTIVE_PROFILE_KEY_V3, result.profile);

  // Keep legacy keys for store.js / auth.js compatibility
  setActiveAccountId(result.account.id);
  setActiveProfileId(result.profile.id);

  return result;
}

/**
 * Login with email + password. Returns account + profiles list.
 * Does NOT select a profile yet.
 */
export async function loginAccount({ email, password }) {
  const cleanEmail = assertEmail(email);
  assertPassword(password);

  const result = await backendLogin(cleanEmail, password);

  // Cache account (with profiles list but no active profile yet)
  const accountCache = {
    id: result.account.id,
    email: result.account.email,
    profiles: result.profiles || [],
    lastProfileId: result.account.lastProfileId || null,
  };
  writeJson(ACTIVE_ACCOUNT_KEY_V3, accountCache);
  // Clear active profile on account login
  localStorage.removeItem(ACTIVE_PROFILE_KEY_V3);
  localStorage.removeItem(ACTIVE_PROFILE_KEY);

  // Update legacy active account key
  setActiveAccountId(result.account.id);

  return result;
}

/**
 * Select and authenticate a profile.
 *
 * Supports three call shapes (the second is kept for backward compatibility):
 *   selectProfile(profileId, { password, trustDevice })
 *   selectProfile(profileId, 'plaintext-password')          // legacy
 *   selectProfile(profileId, { deviceTrustToken })          // password-less unlock
 *
 * When `trustDevice` is true and the password is correct, the backend returns a
 * `deviceTrustToken` which we persist under the active account so subsequent
 * profile switches on this device can skip the password modal.
 */
export async function selectProfile(profileId, optionsOrPassword) {
  // Normalize the legacy `selectProfile(id, "password")` signature.
  const options = typeof optionsOrPassword === 'string'
    ? { password: optionsOrPassword }
    : (optionsOrPassword || {});

  const hasToken = typeof options.deviceTrustToken === 'string' && options.deviceTrustToken.length > 0;
  if (!hasToken) {
    // Token-less path: a password is required (and must meet the basic policy).
    assertPassword(options.password);
  }

  const result = await backendSelectProfile(profileId, {
    password: options.password,
    deviceTrustToken: options.deviceTrustToken,
    trustDevice: options.trustDevice === true,
  });

  writeJson(ACTIVE_PROFILE_KEY_V3, result.profile);
  setActiveProfileId(result.profile.id);

  // Persist a freshly-issued device-trust token, if any.
  if (result && typeof result.deviceTrustToken === 'string' && result.deviceTrustToken) {
    const account = getActiveAccount();
    if (account && account.id) {
      setDeviceTrustToken(account.id, result.profile.id, result.deviceTrustToken);
    }
  }

  return result;
}

/**
 * Create a new profile on the backend.
 */
export async function createProfile(accountId, { username, password, currency = 'EUR', locale = 'it-IT' }) {
  assertUsername(username);
  assertPassword(password);

  const result = await backendCreateProfile(username, password, currency, locale);

  // Update profiles list in cached account
  const account = getActiveAccount();
  if (account) {
    const profiles = Array.isArray(account.profiles) ? account.profiles : [];
    profiles.push(result.profile);
    writeJson(ACTIVE_ACCOUNT_KEY_V3, { ...account, profiles });
  }

  return result.profile;
}

/**
 * Delete a profile.
 */
export async function deleteProfile(accountId, profileId) {
  await backendDeleteProfile(profileId);

  // Drop any cached device-trust token for the deleted profile.
  if (accountId) clearDeviceTrustForProfile(accountId, profileId);

  // Remove from cached profiles list
  const account = getActiveAccount();
  if (account && Array.isArray(account.profiles)) {
    account.profiles = account.profiles.filter(p => p.id !== profileId);
    writeJson(ACTIVE_ACCOUNT_KEY_V3, account);
  }

  // If the deleted profile was active, clear it
  const activeProfile = getActiveProfile();
  if (activeProfile && activeProfile.id === profileId) {
    localStorage.removeItem(ACTIVE_PROFILE_KEY_V3);
    localStorage.removeItem(ACTIVE_PROFILE_KEY);
  }

  return true;
}

// Re-export device-trust helpers so call sites can stay inside auth-accounts.
export { getDeviceTrustToken, clearDeviceTrustForProfile };

/**
 * Logout — calls backend, clears localStorage v3 keys.
 * Does NOT delete v1/v2 keys.
 */
export async function logoutAccount() {
  try {
    await backendLogout();
  } catch (e) {
    console.warn('[auth-accounts] Backend logout error:', e.message);
  }
  localStorage.removeItem(ACTIVE_ACCOUNT_KEY_V3);
  localStorage.removeItem(ACTIVE_PROFILE_KEY_V3);
  // Also clear legacy keys so old code doesn't confuse state
  localStorage.removeItem(ACTIVE_ACCOUNT_KEY);
  localStorage.removeItem(ACTIVE_PROFILE_KEY);
}

/**
 * Check if the current session cookie is still valid.
 * If yes, refresh the localStorage cache from the server.
 * If no, keep local state as-is (offline mode).
 */
export async function checkAndRestoreSession() {
  try {
    const result = await getMe();
    if (!result.available || !result.account) return { restored: false };

    const lastProfileId = result.lastProfileId
      || (result.account && result.account.lastProfileId)
      || null;

    const accountCache = {
      id: result.account.id,
      email: result.account.email,
      profiles: result.profiles || [],
      lastProfileId,
    };
    writeJson(ACTIVE_ACCOUNT_KEY_V3, accountCache);

    if (result.profile) {
      writeJson(ACTIVE_PROFILE_KEY_V3, result.profile);
      setActiveProfileId(result.profile.id);
    }
    setActiveAccountId(result.account.id);

    return {
      restored: true,
      account: result.account,
      profile: result.profile,
      lastProfileId,
    };
  } catch (e) {
    console.warn('[auth-accounts] Session restore failed:', e.message);
    return { restored: false };
  }
}

// ── List helpers ───────────────────────────────────────────────────────────────

export function listAccountsSummary() {
  const account = getActiveAccount();
  if (!account) return [];
  return [{
    id: account.id,
    email: account.email,
    profileCount: Array.isArray(account.profiles) ? account.profiles.length : 0,
    defaultProfileId: null,
    lastLoginAt: account.lastLoginAt || null,
  }];
}

export function listProfilesForAccount(accountId) {
  const account = getActiveAccount();
  if (!account || account.id !== accountId) return [];
  return Array.isArray(account.profiles) ? account.profiles : [];
}

// ── Aliases for backward compatibility with profiles.js ───────────────────────

export async function loginProfile(accountId, { username, password }) {
  // In v3, we select by profileId+password; find the profileId from username
  const profiles = listProfilesForAccount(accountId);
  const profile = profiles.find(p => p.username === username);
  if (!profile) throw new Error('Profilo non trovato.');
  return selectProfile(profile.id, { password });
}

export function setDefaultProfile(accountId, profileId) {
  // Best-effort local-only (no backend endpoint for this in the spec)
  const account = getActiveAccount();
  if (!account || account.id !== accountId) return;
  writeJson(ACTIVE_ACCOUNT_KEY_V3, { ...account, defaultProfileId: profileId });
}

export function logoutProfile() {
  localStorage.removeItem(ACTIVE_PROFILE_KEY_V3);
  localStorage.removeItem(ACTIVE_PROFILE_KEY);
}

/** @deprecated Use logoutAccount() */
export async function deleteAccount(accountId) {
  console.warn('[auth-accounts] deleteAccount is deprecated in v3.');
  return logoutAccount();
}

/** @deprecated Use checkAndRestoreSession() */
export async function syncAccountsWithBackend() {
  return checkAndRestoreSession();
}
