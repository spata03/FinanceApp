/**
 * middleware/session.js — Cookie parsing, signing, and session restoration.
 */

import crypto from 'node:crypto';
import { config } from '../config.js';
import * as sessions from '../../db/repositories/sessions.repo.js';

const { sessionSecret, sessionCookieName, sessionTtlMs } = config;

export function parseCookies(header = '') {
  return header.split(';').reduce((cookies, part) => {
    const [rawName, ...rawValue] = part.trim().split('=');
    if (!rawName) return cookies;
    cookies[rawName] = decodeURIComponent(rawValue.join('=') || '');
    return cookies;
  }, {});
}

function signSessionId(sessionId) {
  return crypto.createHmac('sha256', sessionSecret).update(sessionId).digest('hex');
}

function encodeSessionCookie(sessionId) {
  return `${sessionId}.${signSessionId(sessionId)}`;
}

export function verifySessionCookie(value = '') {
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

export function setCookieHeader(req, sessionId) {
  const cookieParts = [
    `${sessionCookieName}=${encodeURIComponent(encodeSessionCookie(sessionId))}`,
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

export function clearCookieHeader() {
  return `${sessionCookieName}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`;
}

/**
 * Get-or-create the session bound to the incoming request.
 * Always sets the Set-Cookie header on the response.
 */
export async function getOrCreateSession(req, res) {
  const cookies = parseCookies(req.headers.cookie || '');
  const raw = cookies[sessionCookieName];
  const verifiedId = verifySessionCookie(raw);

  let session = null;
  if (verifiedId) {
    session = await sessions.getSession(verifiedId);
  }

  if (!session) {
    const newId = crypto.randomBytes(32).toString('hex');
    session = await sessions.createSession({
      id: newId,
      expires_at: Date.now() + sessionTtlMs,
    });
    const csrfToken = await sessions.generateCsrfToken(newId);
    session = await sessions.getSession(newId);
    if (session) session.csrf_token = csrfToken;
  }

  res.setHeader('Set-Cookie', setCookieHeader(req, session.id));
  // Fire-and-forget last_seen_at update — do not block request on it.
  sessions.updateSessionLastSeen(session.id).catch(() => undefined);
  return session;
}
