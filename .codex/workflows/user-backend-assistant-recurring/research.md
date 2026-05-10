# Research Report

## Task
Migliorare la gestione utente con un backend dedicato, potenziare l'assistente con una valutazione economica ragionata, aggiungere spese mensili ricorrenti e valutare senza implementare l'accesso diretto ai conti bancari.

## Repository Findings
- Package manager: none
- Framework/runtime: vanilla HTML/CSS/ES modules in browser; optional local HTTP server
- Relevant scripts: none
- Relevant conventions: Italian UI copy, dark design tokens, localStorage persistence, no dependencies, browser HTML tests

## Reuse Map
- `src/data/store.js`: central state, normalization, persistence, transaction APIs.
- `src/utils/calculations.js`: balance, category and month grouping for assistant analysis.
- `src/utils/formatters.js`: currency, percent, month/date formatting.
- `src/utils/helpers.js`: escaping, toast, validation, date helpers.
- `src/components/TransactionModal.js`: existing transaction add/edit flow for adding the monthly expense option.
- `src/pages/transactions.js`: shared income/expense page; add the fixed expense section only for expenses.
- `src/pages/settings.js`: existing profile settings; add backend profile sync without removing local fallback.
- `tests/store-assistant.test.html`: targeted behavior coverage for store and assistant.
- `tests/page-imports.test.html`: module import coverage.

## Likely Files To Edit
- `backend/server.js`: no-dependency secure local backend for profile/session and assistant analysis endpoint.
- `src/utils/backendClient.js`: browser API client with safe static fallback.
- `src/data/store.js`: recurring monthly expense state, normalization and materialization.
- `src/components/TransactionModal.js`: monthly expense checkbox for new expenses.
- `src/pages/transactions.js`: fixed monthly expense panel and source filtering.
- `src/pages/settings.js`: backend profile status and save path.
- `src/pages/assistant.js`: async backend analysis with local fallback.
- `src/utils/assistant.js`: stronger local finance assessment.
- `tests/store-assistant.test.html`: recurring and assistant assertions.
- `tests/page-imports.test.html`: import new frontend client.
- `README.md`: document optional backend startup.

## Files To Avoid
- `src/data/categories.js`: categories already cover fixed expenses like casa and abbonamenti.
- Existing route/public function names: preserve current imports and app routing.

## Risks And Edge Cases
- No package manager means the backend must use only Node built-ins.
- Static app must keep working when `/api/*` endpoints are absent.
- Generated monthly expenses must not duplicate if the app is opened multiple times in the same month.
- Deleting a generated monthly transaction should not immediately regenerate it in the same month.
- A deterministic local assistant is not a certified financial advisor and not a full LLM unless a future provider is wired through the backend.
- Bank account integration can avoid password sharing, but cannot avoid processing personal/financial data if transactions are imported.

## Acceptance Criteria
- AC-001: The app can use a dedicated backend for user profile/session via secure HttpOnly session cookie and CSRF-protected profile saves, while preserving static local fallback.
- AC-002: New expense creation can mark a cost as monthly; active monthly expenses are listed separately and generate at most one transaction per month.
- AC-003: The assistant returns a more reasoned economic assessment including score, fixed/manual expense split, risks and practical next actions, with backend analysis when available and local fallback.
- AC-004: Behavior changes are covered by targeted tests or documented checks, including recurring expense deduplication and assistant output.
- AC-005: The bank-account access question is answered without implementation, with current source-backed security and privacy constraints.

## Implementation Plan
1. Add workflow state artifacts.
2. Extend store schema with recurring expenses and monthly occurrence materialization.
3. Add the expense modal monthly option and Spese page fixed/manual separation.
4. Add backend server and frontend backend client with graceful fallback.
5. Wire settings profile sync and assistant backend/local analysis.
6. Update tests and README.
7. Run available checks and perform review loop.

## Verification Plan
1. `node --check backend/server.js`.
2. Serve the static app on localhost and run existing browser test pages with headless browser.
3. Check import tests include the new frontend module.

## Open Questions
- None. Backend authentication is intentionally minimal session-based profile management because the current app has no password/account model and scope is constrained.
