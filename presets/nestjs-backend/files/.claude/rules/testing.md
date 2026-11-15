---
paths:
  - "**/*.spec.ts"
  - "test/**"
---

# Testing (defaults; `.claude/project-profile.md` overrides them)

- Tests must give real confidence: assert behaviour and outcomes, not that a mock was called.
- Unit tests mock external services (identity provider, storage, email, queues, LLMs). Integration tests use a real database.
- Cover the happy path, not found or empty, validation failure, authorization failure, and for nested routes a wrong-parent case.
- If the profile defines requirement IDs (`requirement_ids`), put the ID in the test title so a gap is findable by search.
- No `.only`, no `.skip` without a written reason, no sleeps: make asynchronous tests deterministic.
- Run the related tests after each batch and the full suite before a PR. Report failures with the output; never claim a pass that was not run.
