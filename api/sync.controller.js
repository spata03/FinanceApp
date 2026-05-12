/**
 * api/sync.controller.js — Per-profile sync state (JSON blob).
 */

import { sendJson } from '../backend/middleware/errors.js';
import { getOrCreateSession } from '../backend/middleware/session.js';
import { assertCsrf } from '../backend/middleware/csrf.js';
import { readBody } from '../backend/middleware/body.js';
import { config } from '../backend/config.js';
import * as syncStateRepo from '../db/repositories/syncState.repo.js';
import * as profilesRepo from '../db/repositories/profiles.repo.js';
import { sanitizeSyncState } from './_helpers.js';

export async function getSyncState(req, res, ctx) {
  const session = await getOrCreateSession(req, res);
  if (!session.account_id) {
    sendJson(res, 403, { error: 'Accedi all\'account prima di sincronizzare i dati.' });
    return;
  }
  const profileId = ctx?.url?.searchParams.get('profileId') || session.profile_id;
  if (!profileId) {
    sendJson(res, 400, { error: 'profileId richiesto.' });
    return;
  }
  const row = await syncStateRepo.getSyncState(session.account_id, profileId);
  sendJson(res, 200, row ? { exists: true, state: row.state } : { exists: false, state: null });
}

export async function putSyncState(req, res) {
  const session = await getOrCreateSession(req, res);
  if (!session.account_id) {
    sendJson(res, 403, { error: 'Accedi all\'account prima di sincronizzare i dati.' });
    return;
  }
  if (!(await assertCsrf(req, session))) {
    sendJson(res, 403, { error: 'Token CSRF non valido' });
    return;
  }
  const body = await readBody(req, config.maxSyncStateBytes);
  const profileId = body.profileId || session.profile_id;
  if (!profileId) {
    sendJson(res, 400, { error: 'profileId richiesto.' });
    return;
  }
  const cleanState = sanitizeSyncState(body.state);
  await syncStateRepo.upsertSyncState(session.account_id, profileId, cleanState);
  if (session.profile_id) {
    await profilesRepo.updateProfile(session.profile_id, { syncedAt: new Date().toISOString() });
  }
  sendJson(res, 200, { exists: true, state: cleanState });
}
