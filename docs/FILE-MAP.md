# File map

What each file in each folder does. `new` and `changed` mark files touched in the 2026-11-13 hardening round. Folder order follows the repository layout.

## Root

| File | Purpose |
|---|---|
| `CLAUDE.md` | Working guide with `{{PLACEHOLDERS}}`: commands, core rules, the workflow table, records, commit policy, naming. Filled in by `init-project.mjs`. |
| `CLAUDE.local.md.example` | Template for personal notes. Copy to `CLAUDE.local.md` (gitignored). |
| `README.md` (changed) | Five-minute start, what you get, rules of the road. |
| `.mcp.json.example` | Example MCP servers (Sentry, Context7). Copy to `.mcp.json` only if needed. |
| `.gitignore` (changed) | Ignores local Claude files, `*.local.md`, secrets, build output, key files. |
| `.editorconfig` (new) | UTF-8, LF, two-space indent, final newline. |

## `.claude/` (base layer, copied to every project)

| File | Purpose |
|---|---|
| `settings.json` (changed) | Permissions (18 allow, 1 ask, 14 deny) and hook wiring: prompt guard, edit guard, OWASP guard, Bash and PowerShell guard, format on edit, Stop gate, session start. |
| `hooks.config.json` (changed) | Per-project hook parameters: source regex, immutable folders, protected policy files (now includes the guardrail files), formatter, Stop-gate checks, ask-before-install. |

### `.claude/hooks/`

| File | Purpose |
|---|---|
| `lib.mjs` (changed) | Shared helpers: read input, load config, block/ask, run tools without a shell, secret patterns (now incl. GitHub, Slack, Google, `sk-`, connection strings). `runBin` accepts a named bin (for `tsc`). |
| `secret-guard.mjs` | UserPromptSubmit: refuses prompts containing secrets. |
| `guard-edits.mjs` (changed) | PreToolUse for Write, Edit, MultiEdit, NotebookEdit: blocks `.env*`, committed migrations, policy files, secrets in content. |
| `guard-bash.mjs` (changed) | PreToolUse for Bash and PowerShell: denies destructive git and shell commands, `.env` reads, literal secrets; asks before push and installs. Only the text of `-m` / `--message` is ignored by the flag rules. |
| `owasp-guard.mjs` (new) | PreToolUse for Write, Edit, MultiEdit: blocks `eval`, disabled TLS verification, JWT `none` or ignored expiry, SQL and shell built by string; asks on raw HTML, weak hashes, wildcard CORS, logged secrets. Test files are skipped. |
| `post-edit.mjs` | PostToolUse: records the edited file and runs the formatter. |
| `stop-gate.mjs` (changed) | Stop: runs configured checks on files edited this session and blocks until green; a missing tool is reported as NOT RUN. |
| `session-start.mjs` | SessionStart: prints branch, ticket and dirty-path count, and a note after compaction. |

### `.claude/commands/` (15 slash commands)

| File | Purpose |
|---|---|
| `analyze-spec.md` | Read-only analysis of new or changed specs; writes `analysis.md` with questions. |
| `freeze-context.md` | Distils the answered analysis into `context.md`; refuses on empty blocking answers. |
| `plan-todo.md` | Proposes layers and batches, waits for `approved`, then writes TODO, contract, briefs, runbook, changelog. |
| `whats-next.md` | Read-only view of the current layer and next command. |
| `implement-layer.md` | Runs a layer's batches in parallel subagents, verifies once, records. |
| `implement-batch.md` | Builds one batch in the current session. |
| `verify-and-test.md` | The single verification pass across all batches. |
| `run-manual-verification.md` | Runs the feature or bug runbook against a real environment. |
| `finalize.md` | Closes the spec: change-history rows, PR draft. |
| `fix-jira-bug.md` | Bug flow: root cause, plan gate, fix, minimal runbook. |
| `close-bug.md` | Records a verified fix and drafts the tracker comment. |
| `triage-jira-bugs.md` | Classifies several tickets, then runs the gated bug flow. |
| `plan-ticket.md` (changed) | One-pass plan, build and runbook for a small ticket. Ticket-ID leftover removed. |
| `create-pr.md` | Drafts and opens a PR. |
| `review-pr.md` | Detects the stack and dispatches to the matching reviewer agent. |

### `.claude/agents/`

| File | Purpose |
|---|---|
| `cross-spec-analyzer.md` (changed) | Backs `/analyze-spec`. Tools limited to Read, Grep, Glob, Bash, Write. |
| `context-freezer.md` (changed) | Backs `/freeze-context`. Tools limited to Read, Grep, Glob, Write. |
| `batch-planner.md` (changed) | Plans in chat until approved. Tools limited to Read, Grep, Glob, Bash. |
| `spec-verifier.md` (changed) | Backs `/verify-and-test`. Tools limited to Read, Grep, Glob, Bash. |
| `jira-bug-fixer.md` | Backs `/fix-jira-bug`. |
| `jira-bug-triager.md` | Backs `/triage-jira-bugs`. |
| `security-reviewer.md` (new) | Read-only OWASP review of a diff; CRITICAL and HIGH block. Run by the implement, verify, review-pr, bug-fix and plan-ticket commands. |
| `generic-pr-reviewer.md` (changed) | Stack-agnostic read-only reviewer; stale reference fixed. |

### `.claude/agent-memory/`

One `MEMORY.md` per agent (`batch-planner`, `generic-pr-reviewer` (changed), `nestjs-batch-implementer`, `react-batch-implementer`, `spec-verifier`): short dated notes about repeated mistakes, empty until needed.

### `.claude/rules/` (always loaded)

| File | Purpose |
|---|---|
| `secrets-and-safety.md` (changed) | Explains what the hooks block and why, including the protected guardrail files. |
| `security-floor.md` (new) | Always loaded: the non-negotiable OWASP floor and how it is enforced (a mirror of `owasp-security` section 0). |
| `responsible-use.md` (new) | Always loaded: honest reporting, no fabrication, personal-data minimisation, no covert behaviour, licences, refusing harmful work. |
| `spec-workflow.md` (changed) | Short rules that are not in `CLAUDE.md`; the lifecycle table lives only in `CLAUDE.md`. |

### `.claude/skills/`

| Folder | Purpose |
|---|---|
| `spec-driven-workflow/` | Lifecycle rules, batch limits, BLOCKING discipline, skill-loading protocol. |
| `api-mastery/` | Idempotency, concurrency, transactions, retries, rate limits, observability. |
| `api-contracts/` | Format of the HTTP contract file. |
| `internal-service-contracts/` | Format of the in-process cross-module contract. |
| `database-design/` | Schema, indexing, migration discipline, transactions. |
| `jira-bug-fix/` | Bug reading order, root-cause discipline, comment tone. |
| `owasp-security/` (changed) | `SKILL.md` (now with the section 0 security floor and two trigger rows) plus 12 topic files: access control, API security, async side effects and outbox, authentication, client-side security, configuration and dependencies, cryptography, injection and SSRF, logging and privacy, Top 10 quick reference, threat modeling, tooling. |
| `spec-vs-code-audit/` | `SKILL.md` plus four pass files: stories and acceptance criteria, backend contracts, cross-cutting, frontend. |
| `api-mastery/` (changed) | Gained working modes (specify, build, review, debug) and a depth table that names the owner skill of each of its 54 concepts. |
| `database-design/` (changed) | Gained a concurrency strategy table, query-plan evidence, expand and contract, soft delete and history, caching; new `cache-and-history.md`. |
| `backend-router/` (new) | Entry point for ad hoc backend work: mode, risk class, smallest skill set, proportionality gate. |
| `guardrail-change-review/` (new) | Regression gate for any change to hooks, settings, commands, agents, skills, scripts, presets or CI: per-class checklist and the gate to run. `batch-plan.mjs check` requires it for batches that touch those paths. |
| `api-design/` (new) | Routes, models, status codes, errors, pagination, versioning, docs, deprecation. |
| `transactional-correctness/` (new) | Idempotency, delivery guarantees, ambiguous provider outcomes. Topic files: `idempotency.md`, `provider-ambiguity.md`. |
| `workflow-orchestration/` (new) | Async jobs, disconnects, webhooks, state machines, compensation. Topic file: `jobs-and-sagas.md`. |
| `resilience-controls/` (new) | Timeouts, retries, breakers, bulkheads, degradation, provider error mapping. Topic file: `retry-matrix.md`. |
| `traffic-and-cost/` (new) | Rate limits, quotas, backpressure, token and per-call cost. Topic file: `token-and-quota-accounting.md`. |
| `observability-audit/` (new) | Logs, correlation IDs, metrics, alerts on silent failure, audit trails. |
| `provider-integrations/` (new) | Provider gateway, environments, mocks, webhook verification. Topic file: `sandbox-only.md` (load only for provider testing). |
| `testing-verification/` (new) | Unit, integration, contract, load and failure-injection tests sized to risk. Topic file: `failure-injection.md`. |

### `.claude/templates/` (11)

`batch-brief`, `bug-plan`, `bug-runbook`, `changelog`, `decision`, `implementation-changelog`, `implementation-log` (legacy), `manual-verification.local`, `module`, `spec-gaps`, `triage`: the starting text for the matching record, each as `<name>.md.template`.

### `.claude/output-styles/`

`plain-tone.md`: plain wording for Jira comments, commits and PRs.

### `.claude/spec-driven/`

| File | Purpose |
|---|---|
| `README.md` | What the vendored workflow is and what is not built yet. |
| `CHANGES.md` | Every edit made to files vendored from the plugin. |
| `upstream.sha256` | Hashes of the upstream originals, used by the validator to detect drift. |
| `project-profile.template.md` | Template for `.claude/project-profile.md`, filled by init. |
| `optional/agents/` | Dormant `fastapi-batch-implementer.md` and `react-batch-implementer.md`. |
| `optional/skills/` | Dormant FastAPI, Next.js and React skills, copied by hand when needed. |
| `walkthroughs/` | Nine worked examples: new spec (backend, frontend), changelog alone, spec plus changelog, bug fix (backend, frontend), first-touch module, two changelogs in one week, parallel layers. |

## `docs/`

| File | Purpose |
|---|---|
| `DECISIONS.md` (changed) | Append-only decisions log; dangling references removed. |
| `architecture.md` (new) | Template for a short architecture overview. |
| `adr/0000-template.md` (new) | Template for an architecture decision record. |
| `FILE-MAP.md` (new) | This file. |
| `claude-code/WORKFLOW-GUIDE.md` | Long-form guide to the workflow. |
| `claude-code/BACKEND-SKILLS.md` (new) | Skill map, merge decisions, routing examples, example prompts and how OWASP is enforced. |
| `claude-code/patches/` (new) | Hardened hooks and `settings.json` for the developer to review and install (`APPLY.md`): the protected files Claude cannot edit. Tested with `HOOKS_DIR=... hooks.test.mjs`. |
| `claude-code/QUALITY-GATES.md` (new) | What runs where (hooks, pre-commit, CI), one-time setup, layering lint snippet, plugin collision note. |

## `.github/` (new)

| File | Purpose |
|---|---|
| `workflows/claude-workflow.yml` | CI for the workflow files: validator, three test suites, gitleaks. |
| `pull_request_template.md` | PR checklist matching `/create-pr`. |
| `dependabot.yml` | Weekly npm and monthly Actions updates. |

## `scripts/`

| File | Purpose |
|---|---|
| `claude/init-project.mjs` | Applies a preset, fills placeholders, merges hook config, never overwrites files. |
| `claude/batch-plan.mjs` (changed) | `check` (now fails a batch without `owasp-security`), `next`, `set`, `records`. |
| `claude/validate-workflow.mjs` | Checks frontmatter, preambles, links, template references and upstream drift. |
| `claude/audit-settings.mjs` | Counts secret-like permission rules without printing values; flags missing required deny entries, whole-tool allows and missing hook scripts. |
| `claude/agent-tools.mjs`, `claude/agent-tool-policy.json` (new) | Single source for the `disallowedTools` line of agents that have no `tools` allowlist: `check` and `apply`. `validate-workflow` fails when an agent drifts. |
| `claude/tests/hooks.test.mjs` (changed) | Behaviour tests for the hooks (including `owasp-guard`) and the bypass regression table: known gaps print as `TODO` until the hardened hooks (`GUARDRAIL_VERSION` 2) are installed, then every case is strict. |
| `claude/tests/batch-plan.test.mjs` | Tests for the batch-plan script, including 8 concurrent writers. |
| `claude/tests/agent-tools.test.mjs` (new) | Tests for the agent deny-list policy tool. |
| `claude/tests/init.test.mjs` (changed) | 34 tests for init output per preset. |
| `maintainers/export-plugin.mjs` | Regenerates the plugin from this repository. |

## `presets/`

`README.md` explains presets. Init keeps the chosen one and deletes the rest.

| Preset | Contents |
|---|---|
| `generic/preset.json` | No stack files; commands are left to fill in. |
| `nestjs-backend/` | `preset.json` (changed: commands, allows, hook config, `tsc` check), `profile-fragment.md`, `skill-map-rows.md`, `upstream.sha256`, and `files/` below. |
| `react-nextjs/` | Same four files (`preset.json` changed), and `files/` below. |

### `presets/nestjs-backend/files/`

| File | Purpose |
|---|---|
| `.claude/agents/nestjs-batch-implementer.md` | Brief-mode implementer for NestJS batches. |
| `.claude/agents/nestjs-pr-reviewer.md` (new) | Read-only NestJS PR reviewer using `review-nestjs-code`. |
| `.claude/rules/api-conventions.md` | Layers, routes, DTOs, authorization, errors, logging (path-scoped to `src/**/*.ts`). |
| `.claude/rules/architecture.md` (new) | Modules, DI, config validation, exception filter, background work. |
| `.claude/rules/database-migrations.md` | Reversible migrations, named indexes. |
| `.claude/rules/testing.md` | Test conventions for specs and e2e. |
| `.claude/skills/nestjs-backend/` | `SKILL.md` plus seven pattern files: controller, DTO, entity, internal service interface, module and migration, service, test. |
| `.claude/skills/review-nestjs-code/` | `SKILL.md`, `checklist.md`, `examples.md`. |
| `.github/workflows/ci.yml` (new) | App CI: lint, typecheck, test, build, a pinned and checksum-verified gitleaks scan of the full history, `npm audit`, and a PR-only dependency review. Actions are pinned to full commit SHAs. |
| `.github/CODEOWNERS`, `.github/dependabot.yml`, `.env.example` (new) | Code owners for the guardrail paths (replace the placeholder team, then require code-owner review), weekly npm and monthly Actions updates, and variable names only. `.env.example` is shipped as `_dot_env.example` and installed by `init`. |
| `.husky/pre-commit`, `.husky/commit-msg` (new) | lint-staged and gitleaks before commit; commitlint on the message. |
| `.lintstagedrc.json`, `.prettierrc`, `.nvmrc`, `commitlint.config.cjs` (new) | Staged-file lint and format, Prettier style, Node 22, commit format `type(scope): summary (TICKET)`. |

### `presets/react-nextjs/files/`

| File | Purpose |
|---|---|
| `.claude/agents/react-batch-implementer.md` | Brief-mode implementer for React and Next.js batches. |
| `.claude/rules/component-conventions.md` | Component conventions (path-scoped to `src` and `app` `.tsx`). |
| `.claude/rules/architecture.md` (new) | Server-first components, caching, Server Actions, feature structure, types. |
| `.claude/rules/testing.md` | Frontend test conventions. |
| `.claude/skills/nextjs-frontend/` | `SKILL.md` plus 13 topic files: code quality and accessibility, common pitfalls, component libraries, data fetching and caching, deployment and config, error and loading UX, metadata and SEO, middleware and auth, performance, routing and rendering, Server Actions, testing, TypeScript and structure. |
| `.claude/skills/react-frontend/` | `SKILL.md` plus eight files: API client, mock and MSW, mutation hooks, query hooks, review checklist, review examples, types, UI wiring. |
| `.github/` (CI, `CODEOWNERS`, `dependabot.yml`), `.env.example`, `.husky/`, `.lintstagedrc.json`, `.prettierrc`, `.nvmrc`, `commitlint.config.cjs` (new) | Same quality-gate files as the NestJS preset. |
