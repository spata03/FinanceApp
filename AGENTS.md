# Repository Instructions For Codex

- Follow this file first, then any more specific `AGENTS.md` files in subdirectories.
- Use the repository's existing package manager and scripts. This repo currently has no `package.json`; run the browser app through a local HTTP server when needed.
- Search for reusable code before creating new helpers. Prefer `src/data/store.js`, `src/utils/formatters.js`, `src/utils/calculations.js`, `src/utils/helpers.js`, `src/data/categories.js`, and existing page/component patterns.
- Respect dirty worktree and user changes. Do not revert unrelated edits.
- Run relevant lint, typecheck, tests, or manual browser checks after edits. If no automated checks exist, state that clearly.
- Use the `js-ts-app-workflow` skill for non-trivial JavaScript/TypeScript feature, refactor, bugfix, UI, or test work.
- Keep long workflow templates in `.agents/skills/js-ts-app-workflow/references/`, not in this file.
- Preserve the existing vanilla ES modules architecture, Italian UI copy, dark design tokens, localStorage persistence, and accessibility attributes unless the task explicitly requires a change.
