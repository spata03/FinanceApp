/**
 * middleware/csrf.js — CSRF token validation.
 */

import * as sessions from '../../db/repositories/sessions.repo.js';

/**
 * Returns a promise that resolves true if the request's x-csrf-token header
 * matches the token stored for the session.
 */
export async function assertCsrf(req, session) {
  const token = req.headers['x-csrf-token'];
  return sessions.validateCsrfToken(session.id, token);
}
