---
name: review-nestjs-code
description: NestJS backend code-review checklist for controllers, services, DTOs, entities, guards, modules, and migrations. Produces a categorized findings report (Correctness, Security, DTOs, API contract, Auth, Errors, TypeScript, Logging, Database, Performance, Architecture, Testing, Tooling). Load during verification when backend (NestJS) files changed.
metadata:
  phases: [verification]
  use_when: "Backend (NestJS) files changed in the batch: run the checklist on those files at verification phase"
---

> **Profile preamble** — Load `.claude/project-profile.md` before applying this skill. The profile, `CLAUDE.md`, and `.claude/rules/` override any conflicting item below. The record names used in this skill (MODULE.md, IMPLEMENTATION-LOG.md) map to whatever the profile sets. With no profile, use the defaults from this file.

> **Conflict notes** — This skill was adapted from `web-team-plugin/skills/review-nestjs-code`. Where a project-specific rule differs from this skill's generic guidance, the project profile wins:
> - **DTO naming**: the checklist says `LoginRequest`/`LoginResponse` as examples; use the naming pattern your profile or `CLAUDE.md` defines instead.
> - **Transaction pattern**: the checklist references `QueryRunner`/`DataSource.transaction`; use the project's own transaction helper or pattern; it must carry the data-isolation context (e.g. tenant-scoped EntityManager) if the profile requires it.
> - **SonarQube**: treat as conditional — follow the item only if the repo has SonarQube configured.
> - **Pre-commit hooks**: treat as conditional — follow the item only if the repo has pre-commit hooks configured.
> - **Cross-module injection**: "import the feature module" is the generic advice; the project profile's cross-module rule wins (e.g. if direct service injection is restricted).

# Review NestJS Backend Code

Perform systematic reviews of NestJS changes using the competency checklist and concrete examples.

## When to apply

- Phase is **verification** and the diff touches controllers, services, DTOs, entities, guards, modules, or migrations
- Mixed PRs: review backend files with this skill and frontend files with a frontend review skill
- Runs as Step 2 of `/verify-and-test` for NestJS batches

## Review workflow

### Step 1 — Confirm scope

- Apply this checklist only to NestJS/API/database/migration files unless a full-stack review is explicitly requested.
- If the change set is unclear, note the assumed scope in the report header.

### Step 2 — Gather the code

| Scenario | Action |
|----------|--------|
| Staged | `git diff --staged` |
| Working tree | `git diff` |
| Branch vs main | `git diff main...HEAD` (or team default base) |
| Specific paths | Read those files |

### Step 3 — Automated signals (when repo allows)

Run project scripts if present (e.g. `pnpm lint`, `pnpm test`, coverage). Summarize pass/fail. If dependencies are missing, note install needed rather than treating as code defects.

### Step 4 — Checklist pass

Walk [checklist.md](checklist.md) against changed files.

### Step 5 — Report

Use the output template in [examples.md](examples.md). Use categories: **Correctness**, **Security**, **DTOs**, **API contract**, **Auth**, **Error handling**, **TypeScript**, **Logging**, **Database**, **Performance**, **Architecture**, **Testing**, **Tooling**.

## Quick reference: competency rules

| Area | Expectation |
|------|-------------|
| Lint | 0 errors and 0 warnings |
| Unit tests | Coverage **≥ 90%** (team gate — lines, statements, functions, branches) |
| DRY | Duplication **not more than ~5%** where measured |
| Formatting | Prettier |
| Sonar | CI integration if repo has it; local Sonar extension for early feedback if configured |
| API docs | **Swagger** documents public APIs |
| Versioning | **API versioning** in place |
| Rate limiting | Enforced where appropriate per project policy |
| CORS | Restricted to **specific** allowed origins |
| Logging | **Centralized** request/response/error logging (no secrets in logs) |
| Time | **UTC** for persisted timestamps |
| Authorization | **Permissions** attached to roles; code checks **permissions**, not hardcoded role names |
| Responses | **Centralized** response interceptor / unified success shape |
| Types | No `any` |
| Validation | **DTOs** + **ValidationPipe**; naming follows the project convention (see profile) |
| Errors | **Global exception filter**; domain failures use **custom codes/messages** from a catalog |
| Transactions | **Transactions** when updating **more than one** table; use the project's transaction pattern |
| DI | Avoid **circular** dependencies; cross-module rules follow the project profile |
| Concurrency | **`Promise.all`** for independent I/O |
| Data | **Seeding** strategy in place for dev/test |
| Constants | No **magic numbers** — named constants |
| Hooks | **Pre-commit** hooks (lint/format) if configured in the repo |
| Lists | **Pagination, sorting, filtering** on server |

## Additional resources

- Full checklist: [checklist.md](checklist.md)
- Example review outputs: [examples.md](examples.md)

## Reminders

- Align naming with project rules (DTOs, files, DB columns) — the profile wins over the examples in this skill.
- Focus on changed code; flag cross-cutting violations when new code triggers them.
- If a spec-vs-code-audit pass ran in Step 1 of `/verify-and-test`, reference its open Partial findings rather than re-running the same checks.
