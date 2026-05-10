# Research Report

## Task
Minimal refactor of the vanilla personal finance app to fix likely errors, improve storage safety, clarify per-user persistence, and add a local AI-style assistant for economic suggestions without changing the current layout direction.

## Repository Findings
- Package manager: none
- Framework/runtime: vanilla HTML/CSS/JavaScript ES modules served through local HTTP
- Relevant scripts: none
- Relevant conventions: Italian UI copy, dark design tokens, hash router, localStorage persistence, page renderers that use `container.innerHTML`, reusable helpers in `src/data` and `src/utils`

## Reuse Map
- `src/data/store.js`: central persistence and settings access.
- `src/utils/formatters.js`: currency, date, month, and percentage formatting.
- `src/utils/calculations.js`: balances, category totals, trends, and goal progress.
- `src/utils/helpers.js`: shared DOM helpers, toast, validation, and HTML escaping.
- `src/data/categories.js`: category labels/icons for assistant insights.
- Existing page/component patterns: route renderers, cards, forms, buttons, event delegation.

## Likely Files To Edit
- `src/data/store.js`: safer hydration and storage metadata.
- `src/utils/helpers.js`: add HTML escaping.
- `src/pages/salvadanaio.js`: fix invalid toast expression and escape rendered descriptions.
- `src/pages/settings.js`: clarify local single-profile persistence and escape profile values.
- `src/pages/dashboard.js`, `src/pages/transactions.js`, `src/pages/savings.js`, `src/components/TransactionModal.js`: escape user-entered values.
- `src/utils/assistant.js`, `src/pages/assistant.js`: local assistant logic and chat page.
- `src/app.js`, `index.html`, `src/styles/components.css`: route, sidebar, and chat styles.
- `tests/*.html`: browser module tests because no package scripts exist.

## Files To Avoid
- `package.json`: do not add a package manager or dependency.
- `src/styles/reset.css`, `src/styles/variables.css`: avoid design-token churn.
- `assets/`: no new assets needed.

## Risks And Edge Cases
- Existing `salvadanaio.js` has a syntax-breaking toast expression.
- Current data is single-user per browser/profile under `finanza_personale_v1`; `userName` is not a separate account.
- Shallow settings merge can drop defaults from older partial saved state.
- User-entered strings interpolated into `innerHTML` can execute or break markup.
- A real LLM from a static app would expose API keys; the minimal safe assistant must be local and rule-based.
- No Node/package scripts are available, so verification needs browser-served HTML tests.

## Acceptance Criteria
- AC-001: Existing routes and the new assistant route render without module parse errors in browser module tests.
- AC-002: Salvadanaio deposits persist an `expense` transaction with category `salvadanaio` and show a valid formatted success toast.
- AC-003: No package manager, framework, backend, build step, or external dependency is added.
- AC-004: Saved data remains readable from `finanza_personale_v1`; malformed or older shapes are normalized without losing valid transactions, savings goals, or settings.
- AC-005: Per-user saving behavior is explicit as a single local browser profile, with no misleading multi-account UI.
- AC-006: User-entered text rendered through `innerHTML` is escaped.
- AC-007: Settings defaults survive partial saved state.
- AC-008: Assistant is local/rule-based and uses existing store/calculation/category helpers.
- AC-009: Assistant answers include practical Italian suggestions and a non-certified-advice note.
- AC-010: Assistant UI reuses existing page/card/form/button styling and remains responsive.

## Implementation Plan
1. Add `escapeHTML` and apply it to high-risk user-rendered fields.
2. Harden store loading with clone fallback, record normalization, settings deep merge, and storage metadata.
3. Fix Salvadanaio toast/date helper usage.
4. Add local assistant helper and page, register route and sidebar item.
5. Add minimal assistant CSS.
6. Add browser HTML tests for store normalization, assistant output, and route rendering.
7. Serve the static app and run the available browser tests.

## Verification Plan
1. Start `python -m http.server` for ES module loading.
2. Run headless Edge against HTML module tests.
3. Fetch static app files over HTTP.
4. Document any environment limits for route smoke checks.

## Open Questions
- None.
