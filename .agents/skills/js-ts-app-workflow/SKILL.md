---
name: js-ts-app-workflow
description: JavaScript/TypeScript app development workflow for feature work, bug fixes, refactors, UI changes, tests, repo analysis, implementation, and review loops using research/planner, implementer, and reviewer agents. Trigger when the user asks Codex to plan, implement, review, or iteratively complete JS/TS app work.
---

# JS/TS App Workflow

Use this skill for non-trivial JavaScript or TypeScript application work. It orchestrates an iterative loop:

1. Research/planner produces a Research Report.
2. Implementer reads the Research Report and implements.
3. Reviewer reads the Research Report, Implementation Report, repo diff, and conventions.
4. If the Review Report status is `OK`, stop and produce the Final Summary.
5. If the status is `WARNING` or `BLOCKED`, return to implementation with the Review Report as input.
6. Repeat review after fixes.
7. Continue until `OK`.

When available, spawn or use the project custom agents by name:
- `js_ts_research_planner`
- `js_ts_implementer`
- `js_ts_reviewer`

If custom agents are not available, do the same roles sequentially in the main Codex session.

## Required Artifacts

For every workflow run, create `.codex/workflows/<task-slug>/` and save:
- `research.md`
- `implementation-iteration-<n>.md`
- `review-iteration-<n>.md`
- `state.json`

Use a short lowercase task slug with hyphens. Update `state.json` after each phase with the task slug, current iteration, current status, report paths, acceptance criteria ids, verification commands, and unresolved review findings.

Safety valve: if two consecutive review cycles report the same blocker with no progress, stop and produce a final `BLOCKED` summary with the exact blocker, evidence, and the smallest user decision needed.

## Report Templates

Use the exact markdown templates in `references/report-templates.md`.

Required report types:
- Research Report
- Implementation Report
- Review Report
- Final Summary

## Acceptance Criteria

Acceptance criteria must be testable and numbered:
- `AC-001`
- `AC-002`
- `AC-003`

Each criterion must define observable behavior, code quality, or verification requirements.

## Review Severity

- `P0`: correctness, security, data loss, or build breaker.
- `P1`: likely regression, missing required AC, type-safety issue, or missing required test.
- `P2`: maintainability or convention issue that should be fixed before OK.
- `P3`: informational only; must not prevent OK unless it indicates missing verification.

Strict status rules:
- Any unresolved `P0`, `P1`, or `P2` means status must be `WARNING` or `BLOCKED`, not `OK`.
- Missing verification for changed behavior means `WARNING`.
- Failing lint, typecheck, or test means `WARNING` if fixable.
- Use `BLOCKED` only when the issue is external, impossible to resolve in the repo, or requires a user decision.

## Implementation Conventions

- Use the existing package manager and scripts.
- Keep TypeScript strictness where TypeScript exists; avoid `any`, double casts, broad suppression comments, and unsafe non-null assertions unless justified.
- Prefer explicit domain types and existing shared types.
- Prefer small pure helpers when logic is reused.
- Reuse existing utilities, hooks, services, validators, API clients, and components before adding new ones.
- Keep functions and components focused and readable.
- Do not add dependencies without clear justification.
- Preserve public API and user-visible behavior unless the AC says otherwise.
- Add regression tests for bug fixes when feasible.
- For React/front-end work, preserve existing design system, accessibility patterns, state management, routing, and data fetching conventions.
- For Node/backend work, preserve existing error handling, validation, logging, config, and API response conventions.

## Verification Order

1. Format only if the repo has a formatter script or config.
2. Lint.
3. Typecheck.
4. Targeted tests.
5. Broader tests or build if relevant and feasible.

If the repo has no package scripts, use the smallest safe runtime checks available, such as serving the static app and checking browser console behavior when feasible.

## Final Output

The final response must include:
- Final status
- Files changed
- AC checklist
- Verification commands and results
- Review iteration count
- Residual risks, or `None identified`
