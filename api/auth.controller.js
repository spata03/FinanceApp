/**
 * api/auth.controller.js — Account + profile authentication endpoints.
 *
 * All handlers are async (require Postgres I/O).
 */

import crypto from 'node:crypto';

import { sendJson } from '../backend/middleware/errors.js';
import { getOrCreateSession, parseCookies, verifySessionCookie, clearCookieHeader } from '../backend/middleware/session.js';
import { assertCsrf } from '../backend/middleware/csrf.js';
import { readBody } from '../backend/middleware/body.js';
import { config } from '../backend/config.js';
import { generateId, normalizeEmail } from './_helpers.js';

import * as accountsRepo from '../db/repositories/accounts.repo.js';
import * as profilesRepo from '../db/repositories/profiles.repo.js';
import * as sessionsRepo from '../db/repositories/sessions.repo.js';
import * as deviceTrustRepo from '../db/repositories/deviceTrust.repo.js';

// Trusted-device tokens are valid for 90 days from creation.
const DEVICE_TRUST_TTL_MS = 90 * 24 * 60 * 60 * 1000;

function sha256Hex(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

const { allowedCurrencies, allowedLocales, sessionCookieName } = config;

// ── Register ───────────────────────────────────────────────────────────────────

export async function register(req, res) {
  const session = await getOrCreateSession(req, res);
  if (!(await assertCsrf(req, session))) {
    sendJson(res, 403, { error: 'Token CSRF non valido' });
    return;
  }
  const body = await readBody(req);
  const email = normalizeEmail(body.email || '');
  const password = String(body.password || '');
  const profileUsername = String(body.profileUsername || '').trim();
  const profilePassword = String(body.profilePassword || '');
  const currency = allowedCurrencies.has(body.currency) ? body.currency : 'EUR';
  const locale = allowedLocales.has(body.locale) ? body.locale : 'it-IT';

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

  if (await accountsRepo.getAccountByEmail(email)) {
    sendJson(res, 409, { error: 'Un account con questa email esiste già.' });
    return;
  }

  const now = new Date().toISOString();
  const accountId = generateId();
  const profileId = generateId();

  const account = await accountsRepo.createAccount({ id: accountId, email, password, createdAt: now });
  const profile = await profilesRepo.createProfile({
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

  await sessionsRepo.updateSession(session.id, { account_id: accountId, profile_id: profileId });
  // Mark this profile as the last used profile for the account
  await accountsRepo.updateAccount(accountId, { lastProfileId: profileId });
  const csrfToken = await sessionsRepo.rotateCsrfToken(session.id);

  sendJson(res, 201, {
    account: { id: account.id, email: account.email, createdAt: account.createdAt },
    profile: { id: profile.id, username: profile.username, currency: profile.currency, locale: profile.locale, storageKey: profile.storageKey },
    csrfToken,
  });
}

// ── Login ──────────────────────────────────────────────────────────────────────

export async function login(req, res) {
  const session = await getOrCreateSession(req, res);
  if (!(await assertCsrf(req, session))) {
    sendJson(res, 403, { error: 'Token CSRF non valido' });
    return;
  }
  const body = await readBody(req);
  const email = normalizeEmail(body.email || '');
  const password = String(body.password || '');

  const account = await accountsRepo.getAccountByEmail(email);
  if (!account || !accountsRepo.verifyPassword(password, account)) {
    sendJson(res, 401, { error: 'Credenziali non valide.' });
    return;
  }

  await accountsRepo.updateAccount(account.id, { lastLoginAt: new Date().toISOString() });
  await sessionsRepo.updateSession(session.id, { account_id: account.id, profile_id: null });
  const csrfToken = await sessionsRepo.rotateCsrfToken(session.id);

  const profiles = (await profilesRepo.getProfilesByAccount(account.id)).map(p => ({
    id: p.id,
    username: p.username,
    currency: p.currency,
    locale: p.locale,
    isDefault: p.isDefault,
    storageKey: p.storageKey,
  }));

  sendJson(res, 200, {
    account: { id: account.id, email: account.email, lastProfileId: account.lastProfileId || null },
    profiles,
    csrfToken,
  });
}

// ── Select profile ────────────────────────────────────────────────────────────

export async function selectProfile(req, res) {
  const session = await getOrCreateSession(req, res);
  if (!session.account_id) {
    sendJson(res, 401, { error: 'Autenticazione richiesta.' });
    return;
  }
  if (!(await assertCsrf(req, session))) {
    sendJson(res, 403, { error: 'Token CSRF non valido' });
    return;
  }
  const body = await readBody(req);
  const profileId = String(body.profileId || '').trim();
  const password = typeof body.password === 'string' ? body.password : '';
  const deviceTrustToken = typeof body.deviceTrustToken === 'string' ? body.deviceTrustToken.trim() : '';
  const wantsTrust = body.trustDevice === true;

  const profile = await profilesRepo.getProfile(profileId);
  if (!profile) {
    sendJson(res, 404, { error: 'Profilo non trovato.' });
    return;
  }
  if (profile.accountId !== session.account_id) {
    sendJson(res, 403, { error: 'Accesso negato.' });
    return;
  }

  // Path A: client supplied a device-trust token — try a password-less unlock.
  // On any failure we deliberately return the same 401 the password path uses
  // so callers cannot tell whether the token or the password was the issue.
  let trustedRow = null;
  if (deviceTrustToken) {
    const tokenHash = sha256Hex(deviceTrustToken);
    trustedRow = await deviceTrustRepo.findActiveTrust({
      accountId: session.account_id,
      profileId,
      tokenHash,
    });
    if (!trustedRow) {
      sendJson(res, 401, { error: 'Password profilo non corretta.' });
      return;
    }
  } else {
    // Path B: classic password check.
    if (!accountsRepo.verifyPassword(password, profile)) {
      sendJson(res, 401, { error: 'Password profilo non corretta.' });
      return;
    }
  }

  await sessionsRepo.updateSession(session.id, { profile_id: profileId });
  // Remember the last used profile for this account.
  await accountsRepo.updateAccount(session.account_id, { lastProfileId: profileId });
  const csrfToken = await sessionsRepo.rotateCsrfToken(session.id);

  let issuedTrustToken = null;
  if (trustedRow) {
    // Refresh "last used" for telemetry / future cleanup.
    await deviceTrustRepo.touchTrust(trustedRow.id).catch(() => null);
  } else if (wantsTrust) {
    // Issue a fresh trust token after a successful password login.
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = sha256Hex(rawToken);
    await deviceTrustRepo.createTrust({
      id: generateId(),
      accountId: session.account_id,
      profileId,
      tokenHash,
      expiresAtMs: Date.now() + DEVICE_TRUST_TTL_MS,
    });
    issuedTrustToken = rawToken;
  }

  sendJson(res, 200, {
    profile: { id: profile.id, username: profile.username, currency: profile.currency, locale: profile.locale, storageKey: profile.storageKey },
    csrfToken,
    ...(issuedTrustToken ? { deviceTrustToken: issuedTrustToken } : {}),
  });
}

// ── Create profile ────────────────────────────────────────────────────────────

export async function createProfile(req, res) {
  const session = await getOrCreateSession(req, res);
  if (!session.account_id) {
    sendJson(res, 401, { error: 'Autenticazione richiesta.' });
    return;
  }
  if (!(await assertCsrf(req, session))) {
    sendJson(res, 403, { error: 'Token CSRF non valido' });
    return;
  }
  const body = await readBody(req);
  const username = String(body.username || '').trim();
  const password = String(body.password || '');
  const currency = allowedCurrencies.has(body.currency) ? body.currency : 'EUR';
  const locale = allowedLocales.has(body.locale) ? body.locale : 'it-IT';

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
    profile = await profilesRepo.createProfile({
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
    const msg = String(e && e.message || e);
    if (/unique/i.test(msg) || e?.code === '23505') {
      sendJson(res, 409, { error: 'Un profilo con questo nome esiste già.' });
      return;
    }
    throw e;
  }

  sendJson(res, 201, {
    profile: { id: profile.id, username: profile.username, currency: profile.currency, locale: profile.locale, storageKey: profile.storageKey },
  });
}

// ── Delete profile ────────────────────────────────────────────────────────────

export async function deleteProfile(req, res, ctx) {
  const session = await getOrCreateSession(req, res);
  if (!session.account_id) {
    sendJson(res, 401, { error: 'Autenticazione richiesta.' });
    return;
  }
  if (!(await assertCsrf(req, session))) {
    sendJson(res, 403, { error: 'Token CSRF non valido' });
    return;
  }
  const profileId = ctx?.profileId;
  const profile = await profilesRepo.getProfile(profileId);
  if (!profile || profile.accountId !== session.account_id) {
    sendJson(res, 403, { error: 'Accesso negato.' });
    return;
  }
  const allProfiles = await profilesRepo.getProfilesByAccount(session.account_id);
  if (allProfiles.length <= 1) {
    sendJson(res, 400, { error: 'Non puoi eliminare l\'unico profilo dell\'account.' });
    return;
  }
  // Revoke any trusted-device tokens for this profile before destroying the row.
  await deviceTrustRepo.revokeTrustsByProfile(profileId).catch(() => null);
  await profilesRepo.deleteProfile(profileId);
  sendJson(res, 200, { ok: true });
}

// ── Me ─────────────────────────────────────────────────────────────────────────

export async function me(req, res) {
  const session = await getOrCreateSession(req, res);
  if (!session.account_id) {
    sendJson(res, 401, { error: 'Non autenticato.' });
    return;
  }
  const account = await accountsRepo.getAccount(session.account_id);
  if (!account) {
    await sessionsRepo.updateSession(session.id, { account_id: null, profile_id: null });
    sendJson(res, 401, { error: 'Non autenticato.' });
    return;
  }
  const profiles = (await profilesRepo.getProfilesByAccount(account.id)).map(p => ({
    id: p.id,
    username: p.username,
    currency: p.currency,
    locale: p.locale,
    isDefault: p.isDefault,
    storageKey: p.storageKey,
  }));
  const activeProfile = session.profile_id ? await profilesRepo.getProfile(session.profile_id) : null;
  sendJson(res, 200, {
    account: {
      id: account.id,
      email: account.email,
      lastProfileId: account.lastProfileId || null,
    },
    profile: activeProfile ? {
      id: activeProfile.id,
      username: activeProfile.username,
      currency: activeProfile.currency,
      locale: activeProfile.locale,
      storageKey: activeProfile.storageKey,
    } : null,
    profiles,
    lastProfileId: account.lastProfileId || null,
  });
}

// ── Logout ─────────────────────────────────────────────────────────────────────

export async function logout(req, res) {
  const cookies = parseCookies(req.headers.cookie || '');
  const raw = cookies[sessionCookieName];
  const verifiedId = verifySessionCookie(raw);
  if (verifiedId) {
    await sessionsRepo.deleteSession(verifiedId);
  }
  res.setHeader('Set-Cookie', clearCookieHeader());
  sendJson(res, 200, { ok: true });
}
