# Report Templates

Use these templates exactly. Replace bracketed placeholders with task-specific content. Keep section headings unchanged.

## Research Report

```markdown
# Research Report

## Task
[Concise task summary.]

## Repository Findings
- Package manager: [name or none]
- Framework/runtime: [framework/runtime]
- Relevant scripts: [scripts or none]
- Relevant conventions: [brief list]

## Reuse Map
- [Existing module/helper/component/type/test and how it should be reused.]

## Likely Files To Edit
- `[path]`: [reason]

## Files To Avoid
- `[path]`: [reason]

## Risks And Edge Cases
- [Risk, edge case, regression, accessibility, security, or data concern.]

## Acceptance Criteria
- AC-001: [Testable criterion.]
- AC-002: [Testable criterion.]

## Implementation Plan
1. [Concrete step.]
2. [Concrete step.]

## Verification Plan
1. [Smallest relevant check.]
2. [Broader check if available/needed.]

## Open Questions
- [Question or `None`.]
```

## Implementation Report

```markdown
# Implementation Report

## Iteration
[n]

## Summary
[Concise description of implementation.]

## Changes Made
- `[path]`: [what changed]

## Acceptance Criteria Status
- AC-001: [Done/Not done] - [evidence]
- AC-002: [Done/Not done] - [evidence]

## Review Fix Mapping
- [Review item id or `Initial implementation`]: [fix/evidence]

## Verification
- `[command]`: [PASS/FAIL/SKIPPED] - [result or reason]

## Notes
- [Important implementation notes or `None`.]
```

## Review Report

```markdown
# Review Report

## Iteration
[n]

## Status
[OK|WARNING|BLOCKED]

## Findings
- [P0|P1|P2|P3] [ID]: [Actionable finding with file/line when available, or `None`.]

## Acceptance Criteria Review
- AC-001: [PASS/FAIL/UNKNOWN] - [evidence]
- AC-002: [PASS/FAIL/UNKNOWN] - [evidence]

## Reuse And Convention Review
- [Observation about reuse, repo conventions, dependencies, public APIs, and unrelated changes.]

## Verification Review
- `[command]`: [PASS/FAIL/SKIPPED/RECOMMENDED] - [result, concern, or recommendation]

## Required Next Actions
- [Action required before OK, or `None`.]
```

## Final Summary

```markdown
# Final Summary

## Final Status
[OK|WARNING|BLOCKED]

## Files Changed
- `[path]`

## AC Checklist
- AC-001: [PASS/FAIL/NOT VERIFIED] - [evidence]
- AC-002: [PASS/FAIL/NOT VERIFIED] - [evidence]

## Verification Commands
- `[command]`: [PASS/FAIL/SKIPPED] - [result or reason]

## Review Iterations
[count]

## Residual Risks
[Risks or `None identified`.]
```
