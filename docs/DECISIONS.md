# Decisions log

Append-only log of decisions, assumptions and deviations made while implementing specs and fixing bugs. Newest entries go at the bottom. Promote an entry into the project profile or `CLAUDE.md` when it matters long term.

Rules:
- Record a decision whenever the spec is silent and a choice was made, the spec, contract and code conflict, a project rule is not followed, or scope is deferred.
- ID format: `D-<SPEC-NUMBER or TICKET>-<nn>`, for example `D-FEAT-007-01` or `D-PROJ-123-01`. Numbers restart per spec or ticket, so parallel branches never collide.
- Never edit or delete an entry. To change a decision, add a new entry that refers to the old one.
- A choice that contradicts a shipped spec also needs its own deviation document, referenced from `CLAUDE.md`.
- Reference the ID from the implementation changelog entry (`Decisions:` line).
- Template: `.claude/templates/decision.md.template`.

## Entries


### D-AUDIT-01: Push wording in CLAUDE.md

- **Date:** 2026-11-14
- **Type:** Decision
- **Source:** archived MASTER-PROMPT-AUDIT-AND-AMENDMENTS (outside the repo), D1
- **Context:** `CLAUDE.md` said "Never push" while `settings.json` and `secrets-and-safety.md` make `git push` ask first.
- **Decision:** `CLAUDE.md` now says "never push without asking", matching the enforced behaviour.
- **Alternatives considered:** Hard-deny push in `settings.json`.
- **Why:** The rule file and settings already ask; one wording removes the contradiction without a new restriction.
- **Approved by:** developer (2026-11-14)
- **Affects:** CLAUDE.md
- **References:** none

### D-AUDIT-02: Risk-based human review for sensitive batches

- **Date:** 2026-11-14
- **Type:** Decision
- **Source:** archived MASTER-PROMPT-AUDIT-AND-AMENDMENTS (outside the repo), W4
- **Context:** The master prompt asks a human to review every line of auth, secrets and PII code; the repo lets AI implement and then verifies.
- **Decision:** Batches stamped `owner: human-review-required` get a mandatory opus `security-reviewer` pass, a developer read of the flagged files only, and developer approval before commit. AI never runs migrations or changes CI. Other batches are unchanged.
- **Alternatives considered:** Line-by-line human review of all security code; no human flag at all.
- **Why:** Strong control where risk is highest, without a review bottleneck.
- **Approved by:** developer (2026-11-14)
- **Affects:** spec-driven-workflow skill, batch-planner, batch-brief template, batch-plan.mjs, verify-and-test
- **References:** none
