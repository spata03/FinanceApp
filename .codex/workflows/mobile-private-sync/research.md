# Research Report

## Task
Rimuovere il blocco percepito nella creazione account da telefono su HTTP privato, aggiungere sincronizzazione privata account/dati tra PC e telefono quando il backend locale e raggiungibile, e chiarire l'uso da telefono con PC spento.

## Repository Findings
- Package manager: none
- Framework/runtime: vanilla ES modules in browser, optional Node.js backend in `backend/server.js`
- Relevant scripts: none
- Relevant conventions: Italian UI copy, dark UI, `localStorage` store singleton, backend same-origin JSON APIs with cookie session and CSRF for writes, browser tests under `tests/*.test.html`

## Reuse Map
- `src/data/auth.js`: reuse existing local account records, password record format, fallback hash path, and account storage keys.
- `src/data/store.js`: reuse normalization, metadata, local cache, and existing store methods.
- `src/utils/backendClient.js`: extend existing same-origin request/session helper for private sync endpoints.
- `backend/server.js`: reuse `DATA_DIR`, JSON helpers, CSRF pattern, and static serving protections.
- `tests/auth-store.test.html` and `tests/backend-syntax.test.html`: extend browser tests for fallback auth/sync helpers and backend parsing.

## Likely Files To Edit
- `src/utils/backendClient.js`: add private sync client calls.
- `src/data/auth.js`: import backend accounts before login/register and push account records after changes.
- `src/data/store.js`: pull/push account state to backend while preserving localStorage cache.
- `src/app.js`: make bootstrap await account/state sync before rendering.
- `backend/server.js`: add file-backed `/api/sync/accounts` and `/api/sync/state` endpoints.
- `sw.js`: cache any edited app modules under a new cache version.
- `tests/auth-store.test.html`: cover fallback account creation and backend account import/export helpers.
- `tests/backend-syntax.test.html`: keep backend parse coverage compatible with new fs/path helpers.
- `README.md`: document private sync limits and always-on/PWA requirements.

## Files To Avoid
- `FinanzaPersonale.exe`: compiled launcher should not be edited manually.
- `assets/icons/app-icon.svg`: unrelated.
- Page modules other than `settings.js`: no behavior change needed there.

## Risks And Edge Cases
- Browser secure-context rules cannot be bypassed for Service Worker/Web Crypto; fallback password hash can allow HTTP private LAN account creation but is weaker than PBKDF2.
- True sync while the PC is off requires either an installed PWA with local offline cache or an always-on private backend; a repo-only change cannot make an offline PC serve data.
- Conflict resolution must avoid silently overwriting newer local or remote changes.
- Returning password verifier records from a private backend mirrors localStorage behavior but exposes hashes to anyone who can reach the private app.
- Store is a singleton loaded before login; bootstrap must reload or sync after active account is set.

## Acceptance Criteria
- AC-001: On an insecure private HTTP origin without `crypto.subtle`, registering and logging in with a password succeeds using the existing fallback password record and no secure-context error blocks account creation.
- AC-002: When the optional backend is reachable, account records are pulled from/pushed to a private file-backed backend so a phone can see an account created on PC.
- AC-003: When the optional backend is reachable and an account is active, financial state is synced by account id; the newer `meta.updatedAt` side wins and localStorage remains the offline cache.
- AC-004: UI/docs state that use with PC off requires either an already installed secure-origin PWA for local offline use or a private always-on backend/VPN for cross-device sync.
- AC-005: Relevant browser/backend tests pass after the changes.

## Implementation Plan
1. Add sync account/state functions to `backendClient.js`, preserving existing API helpers.
2. Add backend account import/export helpers to `auth.js`; call pull before auth UI/bootstrap and push after register/login.
3. Add store `syncWithBackend()` and fire-and-forget push after state changes.
4. Add private sync endpoints in `backend/server.js` with CSRF writes, payload limits, sanitization, and file storage under ignored `backend/data/`.
5. Await auth/state sync in `app.js` before initial render and update Settings/README copy.
6. Extend tests and service worker cache version.

## Verification Plan
1. Serve the app with `python -m http.server 8084 --bind 127.0.0.1` and run existing browser tests with headless Edge/Chrome where available.
2. Run `node -c backend/server.js` if Node is available.
3. Exercise backend syntax browser test to ensure the server module parses under the existing fake harness.

## Open Questions
- None for implementation. The PC-off requirement has a platform limit; implementation will provide offline cache/sync-capable code and document the private always-on backend requirement.
