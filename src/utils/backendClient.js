/**
 * backendClient.js - HTTP client for the FinanzaPersonale backend API
 *
 * Key design decisions:
 * - CSRF token is stored from /api/session response and reused until it fails
 * - On 403 "Token CSRF", retry once after refreshing the token (max 2 attempts)
 * - Deprecated sync/accounts and sync/login endpoints are preserved as no-ops
 *   for backward compatibility but marked as deprecated
 */

let _csrfToken = null;       // In-memory CSRF token cache
let _sessionPromise = null;  // Pending /api/session request
let _sessionTimestamp = null;
const SESSION_TTL_MS = 30 * 60 * 1000; // 30 min before re-fetching session

export function invalidateSession() {
  _sessionPromise = null;
  _sessionTimestamp = null;
  _csrfToken = null;
}

// ── Low-level helpers ──────────────────────────────────────────────────────────

async function parseJson(response) {
  const text = await response.text();
  if (!text) return {};
  return JSON.parse(text);
}

async function requestJson(path, options = {}) {
  const response = await fetch(path, {
    credentials: 'same-origin',
    ...options,
    headers: {
      Accept: 'application/json',
      ...(options.headers || {}),
    },
  });

  const payload = await parseJson(response);
  if (!response.ok) {
    const err = new Error(payload.error || `Backend non disponibile (${response.status})`);
    err.status = response.status;
    throw err;
  }
  return payload;
}

// ── Session / CSRF management ──────────────────────────────────────────────────

/**
 * Fetch (or return cached) session data including CSRF token.
 * The CSRF token is cached in-memory; on server restart the token
 * persists in SQLite, so the first /api/session returns the same token.
 */
async function fetchSession() {
  const session = await requestJson('/api/session');
  if (session.csrfToken) {
    _csrfToken = session.csrfToken;
  }
  return { ...session, available: true };
}

async function ensureFreshSession() {
  const now = Date.now();
  if (!_sessionPromise || !_sessionTimestamp || (now - _sessionTimestamp) > SESSION_TTL_MS) {
    _sessionTimestamp = Date.now();
    _sessionPromise = fetchSession()
      .catch(error => {
        _sessionPromise = null;
        return { available: false, error: error.message };
      });
  }
  return _sessionPromise;
}

export async function ensureBackendSession() {
  return ensureFreshSession();
}

// ── CSRF retry wrapper ─────────────────────────────────────────────────────────

/**
 * Execute a request factory with automatic CSRF retry.
 * On a 403 CSRF error: invalidate cache, fetch a fresh token, retry once.
 * If it fails again, throw the error (no infinite loop).
 */
async function requestWithCsrfRetry(buildRequest) {
  let attempt = 0;
  while (attempt < 2) {
    try {
      return await buildRequest(_csrfToken);
    } catch (error) {
      if (attempt === 0 && error.status === 403 && error.message?.includes('Token CSRF')) {
        console.debug('[CSRF] Token scaduto o non valido — refresh in corso...');
        invalidateSession();
        const session = await fetchSession().catch(() => ({ available: false }));
        if (!session.available) {
          throw new Error('Impossibile ottenere il token CSRF. Ricarica la pagina.');
        }
        // _csrfToken is updated by fetchSession
        attempt++;
        continue;
      }
      throw error;
    }
  }
}

// ── Auth endpoints ─────────────────────────────────────────────────────────────

export async function registerAccount(email, password, profileUsername, profilePassword, currency = 'EUR', locale = 'it-IT') {
  return requestWithCsrfRetry(async (csrfToken) => {
    if (!csrfToken) {
      const session = await ensureFreshSession();
      if (!session.available) throw new Error(session.error || 'Sessione non disponibile');
    }
    return requestJson('/api/auth/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': _csrfToken || '',
      },
      body: JSON.stringify({ email, password, profileUsername, profilePassword, currency, locale }),
    });
  });
}

export async function loginAccount(email, password) {
  // Always fetch a fresh session before login to get a valid CSRF token
  invalidateSession();
  const session = await fetchSession().catch(() => ({ available: false }));
  if (!session.available) throw new Error('Server non raggiungibile.');

  return requestWithCsrfRetry(async () => {
    return requestJson('/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': _csrfToken || '',
      },
      body: JSON.stringify({ email, password }),
    });
  });
}

export async function selectProfile(profileId, password) {
  return requestWithCsrfRetry(async () => {
    if (!_csrfToken) {
      const session = await ensureFreshSession();
      if (!session.available) throw new Error(session.error || 'Sessione non disponibile');
    }
    return requestJson('/api/auth/profile/select', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': _csrfToken || '',
      },
      body: JSON.stringify({ profileId, password }),
    });
  });
}

export async function createProfile(username, password, currency = 'EUR', locale = 'it-IT') {
  return requestWithCsrfRetry(async () => {
    if (!_csrfToken) {
      const session = await ensureFreshSession();
      if (!session.available) throw new Error(session.error || 'Sessione non disponibile');
    }
    return requestJson('/api/auth/profile/create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': _csrfToken || '',
      },
      body: JSON.stringify({ username, password, currency, locale }),
    });
  });
}

export async function deleteProfile(profileId) {
  return requestWithCsrfRetry(async () => {
    if (!_csrfToken) {
      const session = await ensureFreshSession();
      if (!session.available) throw new Error(session.error || 'Sessione non disponibile');
    }
    return requestJson(`/api/auth/profile/${encodeURIComponent(profileId)}`, {
      method: 'DELETE',
      headers: {
        'X-CSRF-Token': _csrfToken || '',
      },
    });
  });
}

export async function getMe() {
  const session = await ensureFreshSession();
  if (!session.available) return { available: false, error: session.error };
  try {
    const data = await requestJson('/api/auth/me');
    return { available: true, ...data };
  } catch (error) {
    return { available: false, error: error.message };
  }
}

export async function logoutAccount() {
  try {
    await requestJson('/api/auth/logout', { method: 'POST' });
  } catch (e) {
    // Best-effort
    console.warn('[backendClient] Logout backend failed:', e.message);
  } finally {
    invalidateSession();
  }
}

// ── Sync state ─────────────────────────────────────────────────────────────────

export async function getSyncedState(accountId, profileId = null) {
  const session = await ensureFreshSession();
  if (!session.available) return { available: false, error: session.error };

  try {
    let url = `/api/sync/state`;
    const params = new URLSearchParams();
    if (profileId) params.set('profileId', profileId);
    const qs = params.toString();
    if (qs) url += '?' + qs;

    const payload = await requestJson(url);
    return { available: true, exists: Boolean(payload.exists), state: payload.state || null };
  } catch (error) {
    return { available: false, error: error.message };
  }
}

export async function saveSyncedState(accountId, state, profileId = null) {
  try {
    return await requestWithCsrfRetry(async () => {
      if (!_csrfToken) {
        const session = await ensureFreshSession();
        if (!session.available) throw new Error(session.error || 'Sessione non disponibile');
      }
      const payload = await requestJson('/api/sync/state', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': _csrfToken || '',
        },
        body: JSON.stringify({ accountId, state, profileId }),
      });
      return { available: true, exists: Boolean(payload.exists), state: payload.state || null };
    });
  } catch (error) {
    return { available: false, error: error.message };
  }
}

// ── Assistant ──────────────────────────────────────────────────────────────────

export async function analyzeWithBackend(question, state) {
  try {
    return await requestWithCsrfRetry(async () => {
      if (!_csrfToken) {
        const session = await ensureFreshSession();
        if (!session.available) return { available: false, error: session.error };
      }
      const result = await requestJson('/api/assistant/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': _csrfToken || '',
        },
        body: JSON.stringify({
          question,
          state: {
            transactions: state.transactions || [],
            recurringEntries: state.recurringEntries || [],
            recurringExpenses: state.recurringExpenses || [],
            savingsGoals: state.savingsGoals || [],
            settings: state.settings || {},
          },
        }),
      });
      return { available: true, reply: result.reply };
    });
  } catch (error) {
    return { available: false, error: error.message };
  }
}

// ── Deprecated endpoints (kept for backward compatibility) ─────────────────────

/** @deprecated Use loginAccount() instead */
export async function loginSyncedAccount(identifier, password) {
  console.warn('[backendClient] loginSyncedAccount is deprecated. Use loginAccount().');
  return { available: false, error: 'Endpoint deprecato.' };
}

/** @deprecated No longer used */
export async function getSyncedAccounts() {
  console.warn('[backendClient] getSyncedAccounts is deprecated.');
  return { available: false, accounts: [] };
}

/** @deprecated No longer used */
export async function saveSyncedAccounts(accounts) {
  console.warn('[backendClient] saveSyncedAccounts is deprecated.');
  return { available: false };
}

/** @deprecated No longer used */
export async function deleteSyncedAccount(accountId) {
  console.warn('[backendClient] deleteSyncedAccount is deprecated. Use deleteProfile().');
  return { available: false };
}

/** @deprecated No longer used */
export async function authorizeSyncedAccount(accountId, authToken) {
  console.warn('[backendClient] authorizeSyncedAccount is deprecated.');
  return { available: false };
}

/** @deprecated Use getMe() instead */
export async function getBackendProfile() {
  console.warn('[backendClient] getBackendProfile is deprecated. Use getMe().');
  return { available: false };
}

/** @deprecated Use selectProfile() or updateProfile instead */
export async function saveBackendProfile(profile) {
  console.warn('[backendClient] saveBackendProfile is deprecated.');
  return { available: false };
}
