# Research Report

## Task
Extend the vanilla JS personal finance app with editable fixed monthly income/expense management, visible separation from variable/manual entries, a monthly overview for fixed expenses, variable expenses, fixed income, variable income, savings, and liquid money, plus a minimal local Windows launcher.

## Repository Findings
- Package manager: none
- Framework/runtime: vanilla HTML/CSS/JavaScript ES modules, static browser app, optional Node `backend/server.js`
- Relevant scripts: none; browser checks run through a local HTTP server
- Relevant conventions: preserve Italian UI copy, dark design tokens, localStorage persistence, ES module pages, `store` as persistence boundary, existing formatters/calculations/helpers, no new package dependencies
- Current fixed-entry support is partial: `src/data/store.js` has `recurringExpenses`, auto-generates current-month expense transactions with `source: 'monthly'`, and tracks `generatedMonthKeys`.
- Fixed monthly income is not modeled. Recurring expenses can be added from `TransactionModal.js`, but recurring definitions can be deleted only from `transactions.js` and not edited.
- `transactions.js` distinguishes expense rows by origin, but income rows do not show origin.
- `report.js` currently shows total income, total expense, and net balance for the selected month.
- `dashboard.js`, `utils/assistant.js`, and `backend/server.js` use current monthly totals and need to remain consistent after fixed income generation.
- Tests are browser-based HTML pages under `tests/`; no npm test runner exists.
- `git` is not available on PATH in this environment.

## Reuse Map
- `src/data/store.js`: extend existing recurring materialization and keep `recurringExpenses` compatibility.
- `src/utils/calculations.js`: add a shared monthly overview helper for fixed/variable income and expense buckets.
- `src/components/TransactionModal.js`: reuse validation/category/date patterns for one-off entries; keep fixed entries distinct.
- `src/pages/transactions.js`: reuse shared Entrate/Spese renderer, filters, tables, badges, and event delegation.
- `src/pages/report.js`: reuse selected-month state and KPI/card patterns.
- `src/utils/assistant.js` and `backend/server.js`: reuse existing local assistant shape while adding fixed income and overview split.
- `tests/store-assistant.test.html`: extend with recurring income/no-duplicate/overview regression checks.

## Likely Files To Edit
- `src/data/store.js`: add fixed income support, normalize/migrate recurring data, add editable recurring APIs, materialize fixed monthly income and expense transactions without duplicates.
- `src/utils/calculations.js`: add monthly overview helper.
- `src/components/RecurringEntryModal.js`: add focused modal for fixed monthly entries.
- `src/components/TransactionModal.js`: keep one-off transaction flow aligned with the new recurring APIs.
- `src/pages/transactions.js`: add fixed management cards for both Entrate and Spese, origin badges and filters.
- `src/pages/monthly.js`: add dedicated monthly management page.
- `src/pages/report.js`: add selected-month overview.
- `src/app.js` and `index.html`: add route/nav for monthly management.
- `src/utils/assistant.js`, `src/utils/backendClient.js`, `backend/server.js`: include recurring income and overview split.
- `tests/*.html`: update regression/smoke checks.
- `tools/FinanzaPersonaleLauncher.cs`, `FinanzaPersonale.exe`: add a no-dependency Windows launcher if compilation is available.

## Files To Avoid
- `src/styles/reset.css`: no feature-specific styling belongs here.
- `src/styles/variables.css`: avoid palette/token churn.
- New package manager files: avoid `package.json`, lockfiles, Electron/Tauri/pkg config, or bundler setup.

## Risks And Edge Cases
- Existing stored `recurringExpenses` must keep loading and avoid duplicate generated transactions.
- Editing a fixed template should update the current-month generated occurrence when present while leaving older history untouched.
- Deleting a fixed template should not silently delete historical transactions.
- Report month navigation needs deterministic materialization for the selected month.
- `source === 'monthly'` should remain the fixed/manual discriminator.
- Savings is ambiguous; minimal implementation treats dated expense transactions in category `salvadanaio` as monthly savings.
- Date parsing should remain consistent with existing code patterns.
- A true Electron-style app would add packaging scope; the launcher should be a tiny compiled Windows helper with no app dependency changes.

## Acceptance Criteria
- AC-001: Users can create fixed monthly entries for both income and expense with amount, category, description, start date/day of month, and active state.
- AC-002: Users can edit and delete fixed monthly entries from the UI for both Entrate and Spese.
- AC-003: Fixed monthly entries generate at most one transaction per entry per month, marked with `source: 'monthly'`, `recurringId`, and `monthKey`.
- AC-004: Existing `recurringExpenses` data continues to load and generate expense transactions after the data model change.
- AC-005: Transaction lists for both income and expense clearly show `Fissa/Mensile` versus `Variabile/Manuale` entries and allow filtering by origin.
- AC-006: A dedicated monthly management view shows fixed expenses, variable expenses, fixed income, variable income, savings, and liquid money.
- AC-007: Monthly savings uses dated `salvadanaio` expense transactions and is excluded from normal variable expenses.
- AC-008: Dashboard/report/assistant totals remain consistent after fixed income and fixed expense materialization.
- AC-009: Browser regression tests cover recurring income generation, no duplicate monthly generation, backward-compatible recurring expense loading, and overview bucket calculations.
- AC-010: No new npm/package/build dependency is introduced.
- AC-011: A local Windows launcher is provided without changing the app architecture.

## Implementation Plan
1. Add a shared recurring-entry normalization/materialization path in `store.js`, preserving `recurringExpenses` compatibility and adding fixed income support.
2. Add store APIs for listing, adding, updating, deleting fixed monthly entries by type, with existing expense APIs kept as wrappers.
3. Add a monthly overview helper in `calculations.js`.
4. Add a fixed-entry modal and extend `transactions.js` management cards, origin badges, origin filters, and handlers.
5. Add a dedicated `Mensile` page and selected-month overview in `report.js`.
6. Update assistant/backend state handling for fixed income and overview split.
7. Add/update browser HTML tests.
8. Compile a small Windows launcher if the local toolchain supports it.

## Verification Plan
1. Serve the app locally with `python -m http.server 8084 --bind 127.0.0.1`.
2. Run browser smoke tests for `tests/page-imports.test.html`, `tests/store-assistant.test.html`, and `tests/backend-syntax.test.html`.
3. Verify static imports and backend syntax.
4. Confirm launcher artifact exists or report compilation blocker.

## Open Questions
- None. Assumptions: savings means dated `salvadanaio` expense transactions; editing fixed templates updates current-month occurrence only; a compiled local launcher is acceptable without Electron/native packaging dependencies.
