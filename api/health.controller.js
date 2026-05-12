/**
 * api/health.controller.js — Liveness probe.
 */

import { sendJson } from '../backend/middleware/errors.js';

export function getHealth(req, res) {
  sendJson(res, 200, { ok: true, service: 'finanza-personale-backend' });
}
