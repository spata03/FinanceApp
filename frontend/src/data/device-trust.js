/**
 * device-trust.js — Client-side storage of per-(account, profile) device-trust
 * tokens so the user does not have to retype the profile password on every
 * profile switch on this same device.
 *
 * The token itself is opaque (server-generated random 32-byte hex string). The
 * server stores only its SHA-256 hash, so leaking the localStorage value still
 * forces an attacker to also obtain the session cookie + CSRF token.
 *
 * Persistence model:
 *   key:   'finanza:device-trust-v1'
 *   value: {
 *     [accountId]: {
 *       __account?: { token: string, savedAt: number },   // account-level trust
 *       [profileId]: { token: string, savedAt: number },  // per-profile trust
 *     }
 *   }
 *
 * The token is preserved across logout on purpose: "ricordami su questo
 * dispositivo" should survive the user logging out and back in with the same
 * account, exactly like a browser "remember this device".
 */

// Reserved sub-key inside each account bucket holding the account-level trust
// token (covers ALL profiles of this account on this device).
const ACCOUNT_TOKEN_SLOT = '__account';

const STORAGE_KEY = 'finanza:device-trust-v1';

function readAll() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (e) {
    return {};
  }
}

function writeAll(value) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value || {}));
  } catch (e) {
    console.warn('[device-trust] localStorage write failed:', e?.message || e);
  }
}

export function getDeviceTrustToken(accountId, profileId) {
  if (!accountId || !profileId) return null;
  // Defensive: never expose the reserved account-trust slot as if it were a
  // per-profile entry, even if callers accidentally pass ACCOUNT_TOKEN_SLOT.
  if (profileId === ACCOUNT_TOKEN_SLOT) return null;
  const all = readAll();
  const entry = all[accountId]?.[profileId];
  if (!entry || typeof entry.token !== 'string' || !entry.token) return null;
  return entry.token;
}

export function setDeviceTrustToken(accountId, profileId, token) {
  if (!accountId || !profileId || !token) return;
  if (profileId === ACCOUNT_TOKEN_SLOT) return;
  const all = readAll();
  if (!all[accountId] || typeof all[accountId] !== 'object') all[accountId] = {};
  all[accountId][profileId] = { token: String(token), savedAt: Date.now() };
  writeAll(all);
}

export function clearDeviceTrustForProfile(accountId, profileId) {
  if (!accountId || !profileId) return;
  if (profileId === ACCOUNT_TOKEN_SLOT) return;
  const all = readAll();
  if (all[accountId] && all[accountId][profileId]) {
    delete all[accountId][profileId];
    if (Object.keys(all[accountId]).length === 0) delete all[accountId];
    writeAll(all);
  }
}

export function clearAllDeviceTrustForAccount(accountId) {
  if (!accountId) return;
  const all = readAll();
  if (all[accountId]) {
    delete all[accountId];
    writeAll(all);
  }
}

// ── Account-level trust token ─────────────────────────────────────────────────

/**
 * Read the account-level trust token (covers any profile of `accountId` on
 * this device). Returns `null` when no token has been stored.
 */
export function getAccountTrustToken(accountId) {
  if (!accountId) return null;
  const all = readAll();
  const entry = all[accountId]?.[ACCOUNT_TOKEN_SLOT];
  if (!entry || typeof entry.token !== 'string' || !entry.token) return null;
  return entry.token;
}

export function setAccountTrustToken(accountId, token) {
  if (!accountId || !token) return;
  const all = readAll();
  if (!all[accountId] || typeof all[accountId] !== 'object') all[accountId] = {};
  all[accountId][ACCOUNT_TOKEN_SLOT] = { token: String(token), savedAt: Date.now() };
  writeAll(all);
}

export function clearAccountTrustToken(accountId) {
  if (!accountId) return;
  const all = readAll();
  if (all[accountId] && all[accountId][ACCOUNT_TOKEN_SLOT]) {
    delete all[accountId][ACCOUNT_TOKEN_SLOT];
    if (Object.keys(all[accountId]).length === 0) delete all[accountId];
    writeAll(all);
  }
}
