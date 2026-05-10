let sessionPromise = null;
let sessionTimestamp = null;
const SESSION_TTL_MS = 30000; // Rinfrescare token ogni 30s per operazioni critiche

export function invalidateSession() {
  sessionPromise = null;
  sessionTimestamp = null;
}

async function ensureFreshSession() {
  const now = Date.now();
  if (!sessionPromise || !sessionTimestamp || (now - sessionTimestamp) > SESSION_TTL_MS) {
    invalidateSession();
  }
  if (!sessionPromise) {
    sessionTimestamp = Date.now();
    sessionPromise = requestJson('/api/session')
      .then(session => ({ ...session, available: true }))
      .catch(error => ({ available: false, error: error.message }));
  }
  return sessionPromise;
}

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

/**
 * Wraps a mutating request with CSRF retry logic.
 * If the first attempt fails with 403 (stale CSRF), it invalidates the
 * cached session, fetches a fresh token, and retries once.
 */
async function requestWithCsrfRetry(buildRequest) {
  try {
    return await buildRequest();
  } catch (error) {
    if (error.status === 403 && error.message?.includes('Token CSRF')) {
      console.debug('[CSRF] Token invalidato, rifetching sessione...');
      invalidateSession();
      // Piccolo delay per evitare conflitti immediati
      await new Promise(resolve => setTimeout(resolve, 100));
      return buildRequest();
    }
    throw error;
  }
}

export async function ensureBackendSession() {
  if (!sessionPromise) {
    sessionTimestamp = Date.now();
    sessionPromise = requestJson('/api/session')
      .then(session => ({ ...session, available: true }))
      .catch(error => ({ available: false, error: error.message }));
  }
  return sessionPromise;
}

export async function getBackendProfile() {
  const session = await ensureBackendSession();
  if (!session.available) return { available: false, error: session.error };

  try {
    const profile = await requestJson('/api/profile');
    return { available: true, profile };
  } catch (error) {
    return { available: false, error: error.message };
  }
}

export async function saveBackendProfile(profile) {
  try {
    return await requestWithCsrfRetry(async () => {
      // Rinfrescare il token per operazioni PUT critiche
      invalidateSession();
      const session = await ensureFreshSession();
      if (!session.available) return { available: false, error: session.error };
      const savedProfile = await requestJson('/api/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': session.csrfToken,
        },
        body: JSON.stringify(profile),
      });
      return { available: true, profile: savedProfile };
    });
  } catch (error) {
    return { available: false, error: error.message };
  }
}

export async function getSyncedAccounts() {
  const session = await ensureBackendSession();
  if (!session.available) return { available: false, error: session.error };

  try {
    const payload = await requestJson('/api/sync/accounts');
    return { available: true, accounts: payload.accounts || [] };
  } catch (error) {
    return { available: false, error: error.message };
  }
}

export async function saveSyncedAccounts(accounts) {
  try {
    return await requestWithCsrfRetry(async () => {
      // Rinfrescare il token per operazioni PUT critiche
      invalidateSession();
      const session = await ensureFreshSession();
      if (!session.available) return { available: false, error: session.error };
      const payload = await requestJson('/api/sync/accounts', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': session.csrfToken,
        },
        body: JSON.stringify({ accounts }),
      });
      return { available: true, accounts: payload.accounts || [] };
    });
  } catch (error) {
    return { available: false, error: error.message };
  }
}

export async function deleteSyncedAccount(accountId) {
  try {
    return await requestWithCsrfRetry(async () => {
      // Rinfrescare il token per operazioni DELETE critiche
      invalidateSession();
      const session = await ensureFreshSession();
      if (!session.available) return { available: false, error: session.error };
      await requestJson(`/api/sync/account?id=${encodeURIComponent(accountId)}`, {
        method: 'DELETE',
        headers: {
          'X-CSRF-Token': session.csrfToken,
        },
      });
      return { available: true };
    });
  } catch (error) {
    return { available: false, error: error.message };
  }
}

export async function loginSyncedAccount(identifier, password) {
  try {
    return await requestWithCsrfRetry(async () => {
      // Rinfrescare il token per operazioni POST critiche
      invalidateSession();
      const session = await ensureFreshSession();
      if (!session.available) return { available: false, error: session.error };
      const payload = await requestJson('/api/sync/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': session.csrfToken,
        },
        body: JSON.stringify({ identifier, password }),
      });
      return { available: true, account: payload.account || null };
    });
  } catch (error) {
    return { available: false, error: error.message };
  }
}

export async function authorizeSyncedAccount(accountId, authToken) {
  try {
    return await requestWithCsrfRetry(async () => {
      // Rinfrescare il token per operazioni POST critiche
      invalidateSession();
      const session = await ensureFreshSession();
      if (!session.available) return { available: false, error: session.error };
      await requestJson('/api/sync/authorize', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': session.csrfToken,
        },
        body: JSON.stringify({ accountId, authToken }),
      });
      return { available: true };
    });
  } catch (error) {
    return { available: false, error: error.message };
  }
}

export async function getSyncedState(accountId) {
  const session = await ensureBackendSession();
  if (!session.available) return { available: false, error: session.error };

  try {
    const payload = await requestJson(`/api/sync/state?accountId=${encodeURIComponent(accountId)}`);
    return {
      available: true,
      exists: Boolean(payload.exists),
      state: payload.state || null,
    };
  } catch (error) {
    return { available: false, error: error.message };
  }
}

export async function saveSyncedState(accountId, state) {
  try {
    return await requestWithCsrfRetry(async () => {
      // Sempre rinfrescare il token prima del PUT critico di sync
      invalidateSession();
      const session = await ensureFreshSession();
      if (!session.available) return { available: false, error: session.error };
      const payload = await requestJson('/api/sync/state', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': session.csrfToken,
        },
        body: JSON.stringify({ accountId, state }),
      });
      return {
        available: true,
        exists: Boolean(payload.exists),
        state: payload.state || null,
      };
    });
  } catch (error) {
    return { available: false, error: error.message };
  }
}

export async function analyzeWithBackend(question, state) {
  try {
    return await requestWithCsrfRetry(async () => {
      // Rinfrescare il token per operazioni POST critiche
      invalidateSession();
      const session = await ensureFreshSession();
      if (!session.available) return { available: false, error: session.error };
      const result = await requestJson('/api/assistant/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': session.csrfToken,
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
