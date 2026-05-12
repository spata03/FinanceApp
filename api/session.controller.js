/**
 * api/session.controller.js — GET /api/session: returns CSRF token and session refs.
 */

import { sendJson } from '../backend/middleware/errors.js';
import { getOrCreateSession } from '../backend/middleware/session.js';
import * as sessions from '../db/repositories/sessions.repo.js';

export async function getSession(req, res) {
  const session = await getOrCreateSession(req, res);
  const csrfToken = await sessions.rotateCsrfToken(session.id);
  sendJson(res, 200, {
    ok: true,
    csrfToken,
    accountId: session.account_id || null,
    profileId: session.profile_id || null,
  });
}
