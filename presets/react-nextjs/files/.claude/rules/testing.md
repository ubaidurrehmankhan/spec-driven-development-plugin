---
paths:
  - "**/*.test.tsx"
  - "**/*.test.ts"
  - "**/*.spec.tsx"
---

# Testing (defaults; `.claude/project-profile.md` overrides them)

- Tests must give real confidence: assert what the user sees or what the component does, not that a mock was called.
- Mock the network layer (MSW or similar), not the component under test.
- Cover the happy path, the loading state, the error state, and the empty state.
- If the profile defines requirement IDs (`requirement_ids`), put the ID in the test title so a gap is findable by search.
- No `.only`, no `.skip` without a written reason, no arbitrary waits: make asynchronous tests deterministic.
- Run the related tests after each batch and the full suite before a PR. Report failures with the output; never claim a pass that was not run.
