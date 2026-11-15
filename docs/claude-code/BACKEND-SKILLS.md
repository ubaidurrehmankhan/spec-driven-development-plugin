# Backend skills, routing and the OWASP floor

How the backend engineering skills fit the workflow, which skill owns what, and how security is kept mandatory. The skills live in `.claude/skills/`; this guide is the map.

## The skills

| Skill | Owns | Load it when |
|---|---|---|
| `owasp-security` (existing, extended) | Security floor (section 0), access control, injection and SSRF, auth, logging, crypto, config, client-side | **Always** (floor); topic files by trigger |
| `api-mastery` (existing, extended) | The reasoning map of 54 concepts, risk triggers, failure analysis, simplicity rule, working modes, the depth table | Backend design, review, audit |
| `api-mastery` sub-files | `audit-and-refactor.md` (refactor and audit workflows) and `anti-patterns.md` | Loaded from `api-mastery` when auditing, refactoring or checking for known anti-patterns |
| `database-design` (existing, extended) | Schema, indexes, migrations, concurrency strategy, transactions, soft delete and history, caching | Schema, query, migration, cache work |
| `api-contracts`, `internal-service-contracts` (existing) | Format of the HTTP and in-process contract files | Writing or checking a contract file |
| `guardrail-change-review` (new) | Regression gate for changes to the guardrail files themselves | Any change to hooks, settings, commands, agents, skills, scripts, presets or CI; `batch-plan.mjs check` requires it in such batches |
| `backend-router` (new) | Mode detection, risk class, smallest skill set, proportionality gate | Ad hoc backend work outside the slash commands |
| `api-design` (new) | Routes, models, status codes, errors, pagination, versioning, docs, deprecation | A public or internal API surface changes |
| `transactional-correctness` (new) | Idempotency, delivery guarantees, ambiguous provider outcomes | Duplicate-prone or money writes, retried provider calls |
| `workflow-orchestration` (new) | Async jobs, disconnects, webhooks, state machines, compensation | Work that outlives a request |
| `resilience-controls` (new) | Timeouts, retries, breakers, bulkheads, degradation, provider error mapping | Any outbound network call |
| `traffic-and-cost` (new) | Rate limits, quotas, backpressure, token and per-call cost | Paid, metered or overloaded paths |
| `observability-audit` (new) | Logs, correlation IDs, metrics, alerts on silent failure, audit trails | Operations that need diagnosis; money or permission changes |
| `provider-integrations` (new) | Provider gateway, environments, mocks, webhook verification | A third-party API wrapper |
| `testing-verification` (new) | Unit, integration, contract, load and failure-injection tests sized to risk | Behavior changes (light); risky flows (deep) |

## What was merged and what was added

Existing skills were kept and extended wherever they already covered the topic.

| Source topic | Decision | Result |
|---|---|---|
| Request-boundary security (validation, authn, authz, injection, secrets) | Existing `owasp-security` already covers it, including SSRF internal ranges | Not duplicated. Added the non-negotiable floor (section 0), webhook and paid-call trigger rows |
| Data modelling, indexing, migrations, caching | Existing `database-design` covered schema, indexes, migrations, concurrency, transactions | Added soft delete and history, caching, a concurrency strategy table, query-plan evidence, expand and contract, and `cache-and-history.md` |
| Concurrency control and transactions | Existing `database-design` | `transactional-correctness` points to it instead of repeating it |
| Outbox | Existing `owasp-security/async-side-effects-and-outbox.md` | `workflow-orchestration` links to it |
| Log redaction | Existing `owasp-security/logging-monitoring-and-privacy.md` | `observability-audit` links to it |
| One-line concept map | Existing `api-mastery` | Kept; gained working modes and a depth table pointing to the focused skills |
| Idempotency, resilience, workflows, cost, observability, providers, tests, API design | No existing skill held more than a one-line entry | Added as new skills |

## Routing examples

| Task | Loads | Stays out |
|---|---|---|
| Simple authenticated CRUD | `owasp-security` floor, `api-design`, stack skill, `testing-verification` | transactional, workflow, resilience, traffic, provider |
| Spec for a payment system (no code) | floor, `transactional-correctness`, `workflow-orchestration`, `provider-integrations`, `resilience-controls`, `observability-audit`, `api-design` | none, but no code |
| Retry-safe payment capture | floor, `transactional-correctness`, `provider-integrations`, `resilience-controls`, `api-design`, `testing-verification` | sandbox reference |
| Review Redis caching | floor, `database-design` | payments, queues |
| Duplicate background-job execution | floor, `workflow-orchestration`, `transactional-correctness`, `testing-verification` | breakers, cache |
| AI feature with credits | floor, `traffic-and-cost`, `transactional-correctness`, `provider-integrations`, `resilience-controls` | saga, sandbox |
| Review a schema and indexes | floor, `database-design` | provider, queue, resilience |
| Diagnose a slow endpoint | floor, `database-design`, `observability-audit` | cache or breaker added blindly |
| Reliable webhook handler | floor, `provider-integrations`, `transactional-correctness`, `workflow-orchestration`, `testing-verification` | sandbox outside tests |
| Multi-service workflow with compensation | floor, `workflow-orchestration`, `transactional-correctness`, `resilience-controls`, `observability-audit` | saga engine if a state table suffices |

Inside a slash command, `spec-driven-workflow`'s Skill Selection Matrix does the selection (one row per TODO characteristic); outside one, `backend-router` does.

## Example prompts

- Specify: "Write a technical specification for card payments (create, capture, refund, webhook). Include failure scenarios and acceptance criteria. No code."
- Build: "Implement POST /payments/{id}/capture. Clients retry after timeouts."
- Review: "Review our Redis caching. Which practices are implemented, partly implemented, missing or not applicable? Cite files and lines. Do not change code."
- Debug: "The nightly import sometimes runs twice and double-inserts rows. Find the cause and propose the smallest fix."

## If the requirement says...

| The requirement or request says | Skills called |
|---|---|
| upload, login, token, tenant, admin, URL input | `owasp-security` topic files (the floor always applies) |
| endpoint, field, status code, filter, pagination, version | `api-design` (+ `api-contracts`) |
| charged twice, double click, retry, capture, last credit | `transactional-correctness` + `database-design` |
| background, webhook, takes minutes, pending/approved status | `workflow-orchestration` |
| third-party API, slow vendor, vendor down | `resilience-controls` + `provider-integrations` |
| plan limit, credits, tokens, cost cap | `traffic-and-cost` |
| who changed, alert if stuck, trace across the queue | `observability-audit` |
| table, index, migration, slow list, soft delete, cache | `database-design` |
| prove under concurrency, lost response, load test | `testing-verification` |

The artifact for this repo walks five worked examples (payment capture through the whole lifecycle, a simple endpoint, a double-charge bug, a caching review, a slow endpoint).

## How OWASP is kept mandatory

Text alone can be skipped, so the floor is enforced in five places.

| Layer | What it does | Where |
|---|---|---|
| Always-loaded rule | Puts the floor in context for every task | `.claude/rules/security-floor.md`, `CLAUDE.md` core rules, session-start reminder |
| Skill | Defines the floor (section 0) and loads topic files by trigger; every new skill carries a "security floor" line | `owasp-security/SKILL.md` |
| Plan gate | A batch plan fails unless every batch lists `owasp-security` | `batch-plan.mjs check` |
| Hook | Blocks `eval`, disabled TLS verification, JWT `none` or ignored expiry, SQL and shell built by string; asks on raw HTML, weak hashes, wildcard CORS, logged secrets | `.claude/hooks/owasp-guard.mjs` |
| Agent | Read-only OWASP review with CRITICAL and HIGH blocking | `.claude/agents/security-reviewer.md`, run by `/implement-layer`, `/implement-batch`, `/verify-and-test`, `/review-pr`, `/fix-jira-bug`, `/plan-ticket` |
| CI | Secret scan and dependency audit on every pull request | `.github/workflows/` (workflow CI and the preset `ci.yml`) |

Limits to be aware of: the hook matches a small set of high-confidence patterns and cannot judge intent; loading a skill is still the model's action, so the plan gate, the reviewer agent and CI exist to catch a miss; test files are skipped by the hook (`owaspGuard.skipPathRegex`).

## Verification

Checked mechanically: every skill's frontmatter, preamble, security-floor line, four-mode table and failure modes; all 54 `api-mastery` concepts have exactly one owner and each skill's "Covers" line matches the table; the repo validator, hook tests (90), batch-plan tests (37) and init tests (34) pass. Not checked: live agent routing in a real session (the descriptions are written to trigger on the right tasks, but that needs a trial), and the hook against a real application codebase.

## Provenance and additions

Rules come from the two attached API Mastery documents, which state they reconstruct the 48-topic curriculum rather than extract the original chats. Not in those documents (my additions): the router skill and four-mode tables; the five-question proportionality gate; the reservation lifecycle, the status-by-status retry matrix, the outcome classes and reconciliation steps, the lock strategy table, the go-live checklist; and the security floor section, hook, reviewer agent and plan gate. (Blocking internal address ranges in the SSRF rule was already in `owasp-security`.)
