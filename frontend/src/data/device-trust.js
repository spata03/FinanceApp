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
 *   value: { [accountId]: { [profileId]: { token: string, savedAt: number } } }
 *
 * The token is preserved across logout on purpose: "ricordami su questo
 * dispositivo" should survive the user logging out and back in with the same
 * account, exactly like a browser "remember this device".
 */

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
  const all = readAll();
  const entry = all[accountId]?.[profileId];
  if (!entry || typeof entry.token !== 'string' || !entry.token) return null;
  return entry.token;
}

export function setDeviceTrustToken(accountId, profileId, token) {
  if (!accountId || !profileId || !token) return;
  const all = readAll();
  if (!all[accountId] || typeof all[accountId] !== 'object') all[accountId] = {};
  all[accountId][profileId] = { token: String(token), savedAt: Date.now() };
  writeAll(all);
}

export function clearDeviceTrustForProfile(accountId, profileId) {
  if (!accountId || !profileId) return;
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
