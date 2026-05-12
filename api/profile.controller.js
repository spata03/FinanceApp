/**
 * api/profile.controller.js — Legacy /api/profile endpoints (settings).
 */

import { sendJson } from '../backend/middleware/errors.js';
import { getOrCreateSession } from '../backend/middleware/session.js';
import { assertCsrf } from '../backend/middleware/csrf.js';
import { readBody } from '../backend/middleware/body.js';
import * as profilesRepo from '../db/repositories/profiles.repo.js';
import { sanitizeProfile } from './_helpers.js';

export async function getProfile(req, res) {
  const session = await getOrCreateSession(req, res);
  let profileData = {};
  if (session.profile_id) {
    const p = await profilesRepo.getProfile(session.profile_id);
    if (p) profileData = { userName: p.username, currency: p.currency, locale: p.locale };
  }
  sendJson(res, 200, sanitizeProfile(profileData));
}

export async function putProfile(req, res) {
  const session = await getOrCreateSession(req, res);
  if (!(await assertCsrf(req, session))) {
    sendJson(res, 403, { error: 'Token CSRF non valido' });
    return;
  }
  const body = await readBody(req);
  const clean = sanitizeProfile(body);
  if (session.profile_id) {
    await profilesRepo.updateProfile(session.profile_id, { currency: clean.currency, locale: clean.locale });
  }
  sendJson(res, 200, clean);
}
