# Repository Conventions

## Package Manager And Commands

- No `package.json` or lockfile is present.
- There are no discovered npm, pnpm, yarn, bun, lint, typecheck, test, or build scripts.
- The app runs as static files through an HTTP server because ES modules cannot be loaded reliably through `file://`.
- README-documented local run commands:
  - `python -m http.server 8080`
  - `npx serve .`

## Framework And Library Stack

- Vanilla HTML5, CSS3, and JavaScript ES modules.
- No front-end framework.
- No backend.
- Persistence uses `localStorage`.
- Formatting uses the browser `Intl` API.
- Fonts load Inter from Google Fonts in `index.html`.

## Source Layout

- `index.html`: app shell, sidebar navigation, root containers, stylesheet imports, module entry.
- `src/app.js`: SPA bootstrap, hash router, sidebar binding, topbar month, mobile sidebar.
- `src/data/`: central store, seed data, category definitions.
- `src/utils/`: formatting, financial calculations, DOM/helpers.
- `src/components/`: reusable UI components such as `TransactionModal.js`.
- `src/pages/`: route renderers for dashboard, transactions, savings, report, and settings.
- `src/styles/`: reset, design tokens, layout, and component styles.
- `assets/`: reserved for icons and fonts.

## Test Layout

- No automated test framework or test files are currently present.
- For behavior changes, prefer adding focused tests only after introducing a test setup intentionally, or document manual verification when a test setup is outside the task scope.

## Naming Conventions

- File names use lower camel case for page and utility modules, except component files use PascalCase, for example `TransactionModal.js`.
- Render functions use `renderX(container)`.
- Component entry points use action names such as `openTransactionModal`.
- Constants use upper snake case, for example `INCOME_CATEGORIES`.
- CSS classes use BEM-like naming, for example `card__title`, `btn--primary`, `kpi-card--income`.
- Route ids and category ids use lowercase Italian labels or snake-like ids.

## Reusable Patterns And Helpers

- Use `store` from `src/data/store.js` for state, settings, transactions, savings goals, subscriptions, and reset.
- Use `src/utils/formatters.js` for currency, date, month/year, percent, compact number, and signed currency formatting.
- Use `src/utils/calculations.js` for balance, grouping, totals, goal progress, days remaining, and percent change.
- Use `src/utils/helpers.js` for template string assembly, `createElement`, toast display, modal helpers, amount validation, today ISO date, and debounce.
- Use category helpers from `src/data/categories.js`, especially `getCategoryInfo`.
- Pages generally render by assigning `container.innerHTML` and then binding events.
- `src/app.js` clones `#page-container` on navigation to clear stale listeners.
- `transactions.js` uses container-level event delegation so `buildHTML()` can rerender without rebinding each control.

## Error Handling Conventions

- Storage load/save catches exceptions and logs with `[Store]` prefixes.
- User-facing validation errors use `showToast`.
- Destructive UI actions use `confirm`.
- Store getters return `structuredClone` copies to avoid accidental external mutation.

## TypeScript Conventions

- This repository currently uses JavaScript, not TypeScript.
- Existing type documentation is JSDoc where useful, especially for data calculations and component parameters.
- If TypeScript is introduced later, preserve strictness and add explicit domain types instead of broad `any`.

## UI Conventions

- UI copy is Italian.
- Theme is dark mode with HSL/hex design tokens in `src/styles/variables.css`.
- Semantic colors: income green, expense red, savings amber, brand purple.
- Layout uses sidebar navigation, responsive mobile hamburger, cards, KPI cards, tables, modals, toasts, progress bars, badges, and chips.
- Prefer existing CSS variables and component classes before adding inline styles.
- Preserve accessibility attributes already used, including `role`, `aria-label`, `aria-current`, `aria-modal`, and labelled dialogs.

## API And Server Conventions

- No API server is present.
- Do not add backend assumptions unless explicitly required by acceptance criteria.
- Local persistence schema is owned by `src/data/store.js` and keyed by `finanza_personale_v1`.

## Do Not Do

- Do not add a package manager, framework, build step, or dependencies without explicit justification.
- Do not bypass `store` for persisted app data.
- Do not duplicate currency/date/calculation/category logic already available in utilities.
- Do not rewrite the SPA router or page lifecycle for a narrow feature.
- Do not change Italian UI text to English unless requested.
- Do not remove accessibility attributes from existing controls.
- Do not perform unrelated formatting churn across app files.
