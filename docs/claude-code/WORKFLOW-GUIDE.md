# Spec-driven workflow for Claude Code: what this boilerplate offers, every file, how to use it

Written for developers who start or join a project that uses Claude Code with specs and Jira-style tickets. Status: the install script, the hooks and `batch-plan.mjs` have automated tests (`scripts/claude/tests/`). The commands are instructions for the model, so where this guide says "should", the behaviour is designed and read but not yet piloted in a live session on a new project.

This is the generic guide. A project adds its own facts in `.claude/project-profile.md` and its own rules in `.claude/rules/`.

---

## 0. What this offers

**In one sentence:** a repeatable, approval-gated path from a spec (or a bug ticket) to a tested change, with parallel batches in layers, a written record of what was done and decided, and hooks that block the costly mistakes. It is plain files in your repo, so nothing is installed and everything is reviewed in pull requests.

| You get | How |
|---|---|
| **A fixed path from spec to PR** | `/analyze-spec` → you answer questions → `/freeze-context` → `/plan-todo` (you reply `approved`) → `/implement-layer` or `/implement-batch` → `/verify-and-test` → `/run-manual-verification` → `/finalize` |
| **One spec or several** | `/analyze-spec` takes several specs and changelogs; `/plan-todo` builds one combined plan |
| **Questions captured, not guessed** | Blocking and non-blocking questions with blank `Answer:` lines; freezing is refused while a blocking one is empty |
| **A contract and a runbook at approval** | `/plan-todo` writes the HTTP contract and the verification runbook before any code |
| **Layers of parallel batches** | Batches in a layer share no files and run at once in subagents, each from its own self-contained brief, each with a named model |
| **A record of everything** | A per-spec implementation changelog (done, in progress, to do; dates; spec version), a decisions log, and one `Change History` row per touched module |
| **You decide about commits** | The default policy asks "commit this batch?" (or once per layer) |
| **Bugs with a gate** | `/fix-jira-bug` writes a plan and waits; a minimal runbook is tested separately; `/close-bug` records it in neutral words and drafts the tracker comment |
| **Skills used on purpose** | Every batch names which skills apply in planning, implementation and verification, with a reason |
| **Guardrails that hold** | JavaScript hooks block secrets, `.env` edits, edits to shipped files in folders you list, destructive commands |
| **Reuse on any project** | One init command applies a stack preset and fills the profile |

**Who does what**

| You | Claude |
|---|---|
| Choose the spec, answer blocking questions, approve the plan, answer the commit question | Reads, analyses, drafts, builds batches (several in parallel), tests, records |
| Approve every tracker write, open the PR, push | Never pushes without your explicit approval, never amends, never posts to Jira or Sentry unasked |
| Fill the `.local.md` credentials files for manual testing | Never invents URLs, tokens or identifiers |

**What it does not do:** it does not replace design judgement and it is not a CI system. Command files are instructions the model follows, so anything that must always hold is enforced by a hook or a script, not only by text.

---

## 1. Start a new project (10 minutes)

1. Copy this folder to your new repo's root (or copy it over a fresh repo). Do not copy `.git`.
2. Run init:

```
node scripts/claude/init-project.mjs --name "Acme Portal" --jira-key ACME --stack nestjs-backend \
  --description "Customer portal API for Acme." --default-branch main
```

   Stacks today: `nestjs-backend`, `generic`. Add `--install/--build/--lint/--test/--verify "<cmd>"` to set the commands in `CLAUDE.md`; `--dry-run` shows what would change; `--force` re-runs.
3. Open `.claude/project-profile.md` and finish §2 (stack facts), §3 (overrides), §5 (integrations). Mark anything unchecked `(verify)`.
4. Add the project's own rules in `.claude/rules/` and trim `CLAUDE.md` to what only this project needs.
5. `cp CLAUDE.local.md.example CLAUDE.local.md` (personal, gitignored). Copy `.mcp.json.example` to `.mcp.json` only if you want those servers; verify each URL in the server's own docs first.
6. Run `node scripts/claude/validate-workflow.mjs` (must print `OK`) and the tests in `scripts/claude/tests/`.
7. Optional: add `"verify:workflow": "node scripts/claude/validate-workflow.mjs && node scripts/claude/tests/hooks.test.mjs && node scripts/claude/tests/batch-plan.test.mjs"` to `package.json`.
8. Commit it as one PR (`chore: add Claude workflow`) so the team reviews the setup like code.

What init does: copies the preset's rules, skills and agent; merges the preset's values into `.claude/hooks.config.json` and extra allow patterns into `.claude/settings.json`; renders `CLAUDE.md` and `.claude/project-profile.md` from templates; creates `specs/`, `docs/todos/`, `docs/contracts/`; deletes presets you did not choose; writes `.claude/spec-driven/init.json`. It never overwrites an existing file and needs no network.

---

## 2. The idea in one minute

- **Plain files, no plugin needed.** Everything is committed in `.claude/`, plus optional MCP servers and CLIs.
- **Two layers.** The **generic layer** (commands, skills, agents, templates) has no project specifics. The **project layer** (`.claude/project-profile.md`, `.claude/rules/`, `.claude/hooks.config.json`, `settings.json`) holds everything specific to your project.
- **Precedence:** the profile, `CLAUDE.md` and `.claude/rules/` beat any generic rule. Every generic file starts with a "Profile preamble" telling Claude to load the profile first and defining the record names (`MODULE.md`, `IMPLEMENTATION-LOG.md`).
- **Hooks and scripts enforce, markdown advises.**

```
you type /command ─► command file (generic)
                       ├─ loads .claude/project-profile.md   (paths, overrides, options, skill map)
                       ├─ loads skills named by phase
                       ├─ may spawn subagents (one per parallel batch, each reading its own brief)
                       ├─ writes artifacts: specs/, docs/todos/, docs/contracts/, docs/DECISIONS.md, src/
                       └─ uses scripts/claude/batch-plan.mjs to validate and track the plan
hooks watch every prompt, edit and shell command (config: .claude/hooks.config.json)
```

---

## 3. Every file, one line each

### 3.1 Commands (`.claude/commands/`)

| File | You type | What it does |
|---|---|---|
| `analyze-spec.md` | `/analyze-spec <spec file(s)>` | Reads new or changed specs against code, prior specs and the roadmap; writes `analysis.md` with questions. Read-only |
| `freeze-context.md` | `/freeze-context <folder>` | Distills the answered analysis into `context.md`; refuses while a blocking answer is empty |
| `plan-todo.md` | `/plan-todo` | Proposes deliverables, layers and batches in chat; after `approved` writes the layered TODO, contract, runbook, briefs and the implementation changelog |
| `whats-next.md` | `/whats-next` | Read-only: current layer, what can run in parallel (model and skills), what waits, the next command |
| `implement-layer.md` | `/implement-layer <L>` | Runs all runnable batches of a layer in parallel subagents, verifies the layer once, records results, asks about commits |
| `implement-batch.md` | `/implement-batch <N>` | Implements one batch here, updates the TODO status and changelog, records decisions, asks about the commit |
| `verify-and-test.md` | `/verify-and-test` | The single verification pass across all batches; record checks first, then tests |
| `run-manual-verification.md` | `/run-manual-verification [feature or PROJ-123]` | Runs the feature runbook or a bug runbook against a real environment from a gitignored credentials file |
| `finalize.md` | `/finalize` | One `Change History` row per touched module, closes the implementation changelog, PR description draft |
| `fix-jira-bug.md` | `/fix-jira-bug PROJ-123` | Root cause, plan file and approval gate, fix with regression test, minimal runbook. Stops before testing and the tracker |
| `close-bug.md` | `/close-bug PROJ-123` | After the runbook passes: neutral changelog and module entries, decisions, drafted tracker comment |
| `triage-jira-bugs.md` | `/triage-jira-bugs PROJ-1, PROJ-2` | Triage file, classification, your decision per cluster, then the gated bug flow per ticket |

### 3.2 Skills (`.claude/skills/`), each tagged with the phases where it applies

| Skill | Phases | One line |
|---|---|---|
| `spec-driven-workflow/` | all | Lifecycle rules: batch limits, parallel-safety test, 60% context breakpoint, BLOCKING vs NON-BLOCKING, Skill Selection Matrix |
| `api-mastery/` | analysis, planning | Reasoning for production APIs: idempotency, concurrency, transactions, retries, rate limits, observability |
| `database-design/` | planning, implementation, verification | Schema, indexing, migration discipline, transactions |
| `owasp-security/` (+8 reference files) | analysis … bug | OWASP Top 10 and API Top 10 build and audit rules |
| `api-contracts/` | planning, verification | Format of the HTTP contract |
| `internal-service-contracts/` | planning, verification | Format of the in-process contract between modules |
| `jira-bug-fix/` | bug | Bug reading order, root-cause discipline, comment tone |
| Stack skills (preset) | planning, implementation | `nestjs-backend/` today; add your own |

### 3.3 Agents (`.claude/agents/`)

`cross-spec-analyzer` (backs analyze), `context-freezer` (freeze), `batch-planner` (plan), `spec-verifier` (verify, read-only), `jira-bug-fixer` (fix), `jira-bug-triager` (triage), and a stack implementer from the preset (`nestjs-batch-implementer`; backs `/implement-batch` and, in brief mode, each parallel batch).

### 3.4 Templates (`.claude/templates/`)

`implementation-changelog`, `batch-brief`, `bug-plan`, `bug-runbook`, `triage`, `decision` (new ones), plus `changelog`, `manual-verification.local`, `spec-gaps`. `module.md.template` is the module-file structure; `implementation-log.md.template` is only for projects that set `records.module_log: file`.

### 3.5 Project layer

| File | One line |
|---|---|
| `CLAUDE.md` | Short working guide: commands, core rules, workflow table, records, commit policy |
| `.claude/project-profile.md` | Paths, stack facts, overrides, process options (commit policy, layers, records), integrations, skill map |
| `.claude/rules/spec-workflow.md`, `secrets-and-safety.md` | Always loaded |
| `.claude/rules/*` from the preset | Stack rules, path-scoped where useful |
| `.claude/hooks.config.json` | Project parameters for the hooks (below) |
| `.claude/settings.json` | Permissions (about 18 allow, `git push` ask, 5 deny) and hook wiring. No secrets |
| `docs/DECISIONS.md` | Append-only decisions log |
| `.gitignore`, `CLAUDE.local.md.example`, `.mcp.json.example` | Ignore personal files; personal notes; optional servers |

### 3.6 Hooks (`.claude/hooks/`) and their config

| File | Fires on | One line |
|---|---|---|
| `secret-guard.mjs` | Every prompt | Refuses JWTs, Bearer tokens, AWS keys, private keys, literal passwords |
| `guard-edits.mjs` | Before Write/Edit | Blocks `.env*`, committed files in `immutableDirs`, files matching `policyFiles`, secret-looking content |
| `guard-bash.mjs` | Before shell commands | Denies `--no-verify`, force-push, `reset --hard`, `rm -rf`, destructive SQL, reading `.env`, literal secrets; asks before `git push`, `docker compose down -v` and (if `askBeforeInstall`) installing a package |
| `post-edit.mjs` | After Write/Edit | Records the edited file; runs the configured formatter on source files |
| `session-start.mjs` | Session start, resume, clear, compact | Prints branch, ticket and dirty-path count |
| `stop-gate.mjs` | When Claude stops | **Not wired by default.** Runs `stopGate.checks` on files edited this session and blocks until green (the platform lets a stop through after 3 blocks) |
| `lib.mjs` | Imported | Helpers and the config loader |

`hooks.config.json` keys: `sourceFileRegex`, `immutableDirs`, `immutableFileRegex`, `immutableHint`, `policyFiles` (`patterns`, `message` with `{file}`), `format` (`pkg`, `args` with `{file}`), `stopGate.checks` (`label`, `pkg`, `args` with `{files}` and `{tmp}`), `askBeforeInstall`. **No config file means only the always-on guards run** (env files, secrets, destructive commands).

To enable the Stop gate, after trying the project on real work add to `.claude/settings.json`:

```json
"Stop": [
  { "hooks": [ { "type": "command", "command": "node", "args": ["${CLAUDE_PROJECT_DIR}/.claude/hooks/stop-gate.mjs"], "timeout": 300 } ] }
]
```

### 3.7 Scripts (`scripts/claude/`)

| File | One line |
|---|---|
| `init-project.mjs` | Applies a preset and fills the templates (section 1) |
| `batch-plan.mjs` | `check` validates the plan block; `next` shows what can run; `set` updates a batch status; `records` validates the implementation changelog and decision IDs |
| `validate-workflow.mjs` | Frontmatter, preamble, links, template references, drift from upstream; warns about links to stack skills you did not install |
| `audit-settings.mjs` | Counts secret-like permission rules, never prints values |
| `tests/` | `hooks.test.mjs`, `batch-plan.test.mjs`, `init.test.mjs` (skips once the project is initialised) |

### 3.8 Bookkeeping and dormant files

`.claude/spec-driven/`: `README.md`, `CHANGES.md` (every edit to the copied files), `upstream.sha256` (pristine hashes), `project-profile.template.md`, `optional/` (dormant FastAPI, Next.js and React skills and implementers), `walkthroughs/` (worked examples).

---

## 4. Where the artifacts land (defaults; the profile can change them)

| Artifact | Path |
|---|---|
| Spec (input) | `specs/<name>.md` |
| Analysis, questions, frozen context | `specs/<folder>/{spec-subset,analysis,context}.md` |
| Layered TODO (with the `batch-plan` block) | `docs/todos/<feature>.todo.md` |
| Batch briefs | `docs/todos/<feature>.briefs/batch-<id>.md` |
| File list and "Needs tests" | `docs/todos/<feature>.changelog.md` |
| **Implementation changelog** | `docs/todos/<feature>.implementation-changelog.md` |
| **Feature runbook** and credentials | `docs/todos/<feature>.manual-verification.md`, `.manual-verification.local.md` (gitignored) |
| PR description draft | `docs/todos/<feature>.pr-description.md` |
| HTTP contract | `docs/contracts/<module>.contract.md` |
| **Module memory** | `src/<module>/<module>.module.md` (a legacy `ANALYSIS.md` or `MODULE.md` is the same file) |
| **Decisions log** | `docs/DECISIONS.md` |
| Bug plan, runbook, credentials, tracker comment | `docs/todos/bugs/<TICKET>.{plan,runbook,local,jira-comment}.md` |
| Triage file | `docs/todos/triage/<YYYY-MM-DD>-<label>.triage.md` |
| Spec gaps | `docs/todos/spec-gaps.md` |

---

## 5. Workflow A: a new spec

Each step is a fresh session (`/clear`); files on disk carry the state.

| # | You do | Claude does | Gate |
|---|---|---|---|
| 1 | `/analyze-spec specs/<file>.md` | Reads spec, roadmap, prior specs, module files, contracts; writes `analysis.md` | None |
| 2 | Write an answer under each `Answer:` (ask the owner for blocking ones) | Nothing | Every blocking question answered |
| 3 | `/freeze-context specs/<folder>` | Writes `context.md`; refuses on empty blocking answers | Frozen |
| 4 | `/plan-todo`, read the plan, reply `approved` | Proposes deliverables, layers, batches (model, skills by phase); after approval writes TODO, contract, runbook, briefs, implementation changelog; runs `batch-plan.mjs check` | Your approval. Hand the contract to the frontend |
| 5 | `/whats-next` | Shows the current layer and what can run in parallel | None |
| 6 | `/implement-layer 0`, then `1`, … (or `/implement-batch N`) | Runs the batches, verifies the layer, records, asks about commits | Build, lint, related tests green; your commit answer |
| 7 | `/verify-and-test` | Record checks, four-pass verification, fixes blocking findings, writes tests | Zero blocking findings |
| 8 | Fill the runbook credentials, `/run-manual-verification` | Drives each test case | All pass |
| 9 | `/finalize` | One `Change History` row per touched module, closes the changelog, drafts the PR text | You review and open the PR |

Spec changed after you analysed it: never edit the frozen `context.md`; run `/analyze-spec` again with the changed spec (treated as a change request); the implementation changelog's spec-versions table gets a new row. Several specs together: `/analyze-spec` with all inputs; `/plan-todo` orders changelog batches before new-spec batches.

## 6. Layers and parallel batches

`/plan-todo` puts one fenced `batch-plan` block (JSON) in the TODO. It is the source of truth the script and the commands read.

| Layer | Typical contents | Runs |
|---|---|---|
| L0 Foundation | Entities, migrations, error codes, constants, DTOs, contract files | Parallel across modules |
| L1 | Repositories and services | Parallel |
| L2 | Controllers, guards, processors, event wiring | Parallel |
| L3 | Cross-module integration and end-to-end | Serial |

Per batch: id, goal, deliverable, `dependsOn`, `model` (`sonnet` default; `opus` for HIGH complexity, auth, data isolation or money; `haiku` only for mechanical work; `inherit`), stack, TODO count, files to create and modify, migrations, skills for planning, implementation and verification, brief path, status (`todo`, `in_progress`, `done`, `failed`, `blocked`), commit.

`node scripts/claude/batch-plan.mjs check <todo>` guarantees: no file appears in two batches of one layer; a dependency sits in a lower layer; at most 3 TODOs, 6 files and 1 migration per batch (limits come from the profile); every batch has a valid model, at least one existing implementation skill and a brief file. It warns when two batches in a layer add migrations.

`/implement-layer N`: preflight (`check`, `next`, refuse a later layer while an earlier one is open, ask if the working tree has foreign changes) → mark batches `in_progress` → one subagent per batch **in one message** (up to `max_parallel_batches`, default 4), each with no conversation history, reading only its brief → compare changed files with the file list → run the full build, lint and related tests **once** → on failure re-run only that batch (at most twice) then ask → record, as the only writer: TODO status, `changelog.md`, implementation changelog, decisions, `records` check → ask about commits → show `next`.

A brief holds: goal and done-when; context from the frozen context; the contract excerpt; files to create, modify and not touch; signatures from other batches it may call; skills with reasons; the profile rules that apply; the lint and test commands for its own files; the report format; when to stop and report.

Limits: platform default 20 concurrent subagents and nesting depth 3; our cap is 4 per layer. A normal subagent never sees the parent conversation, which is why briefs are self-contained. All batches share one working tree, so file lists must stay disjoint (the script enforces it).

## 7. Records: changelog, decisions, module file, commits

- **Implementation changelog:** a status board, a spec-versions table and dated append-only entries, each with `Decisions:` and `Deviations:` lines (`none` when empty). Neutral, factual wording.
- **Decisions log:** a choice is recorded when the spec is silent, sources conflict, a project rule is not followed, or scope is deferred. IDs `D-<SPEC-NUMBER or TICKET>-<nn>`; numbers restart per spec or ticket so branches never collide. Entries are never edited.
- **Enforcement:** `batch-plan.mjs records` fails on a missing `Decisions:` or `Deviations:` line or an ID that is not in the log; `/verify-and-test` runs it first. A decision nobody wrote down cannot be detected by a tool, so the rule is "outside the spec means ask first, then record", and the verifier compares the diff with the spec.
- **Module file:** one per module, edited in place, with an append-only `Change History`. `/finalize` writes one row per touched module.
- **Commit policy** (`commit_policy` in the profile): `ask` (default) shows the files and a message and you answer yes, yes with another message, or no; in layer mode once per layer. `auto` and `never` exist. Always: stage by name, never commit a red batch, never push, never amend.

## 8. Skills by phase

The map is in `.claude/project-profile.md` §8, built by init. Tags live in each skill's frontmatter (`metadata.phases`, `metadata.use_when`), in the `batch-plan` block per batch and phase, and in every brief. `batch-plan.mjs check` fails a plan that names a skill that does not exist. Loading a skill is something the model does, so the tags in the brief are what make it dependable.

## 9. Bugs

**One bug:** `/fix-jira-bug PROJ-123` (root cause; writes `docs/todos/bugs/PROJ-123.plan.md`; **stops for approval**; spec gaps and ambiguity stop here) → reply `approved` (fix, regression test, minimal runbook, commit question) → fill `PROJ-123.local.md`, `/run-manual-verification PROJ-123` (stops on failure, never fixes code) → `/close-bug PROJ-123` (neutral entries, decisions checked, comment drafted for your approval). Any choice outside the spec is recorded as `D-PROJ-123-<nn>` and shown in the plan.

**Many bugs:** `/triage-jira-bugs PROJ-1, PROJ-2` writes the triage file and classifies each ticket `CODE_FIX`, `SPEC_GAP` or `AMBIGUOUS`; nothing is fixed. You decide per cluster; each approved `CODE_FIX` runs the gated flow; `SPEC_GAP` tickets go to `docs/todos/spec-gaps.md` and are never code-fixed.

## 10. What the hooks do to you

| You see | Meaning | What to do |
|---|---|---|
| "Prompt not sent: it contains a JWT, Bearer token or password" | `secret-guard` | Remove it, name an environment variable instead; rotate it if real |
| "Blocked: .env files are never edited" | `guard-edits` | Change `.env.example` and document the variable |
| "Blocked: … is already committed" | An `immutableDirs` folder | Add a new file instead |
| "Blocked: … policy-protected" (your message) | A `policyFiles` entry | Write the proposal your message names |
| "Blocked: the command contains …" | A literal secret in a command | Use an environment variable such as `$API_TOKEN` |
| Permission prompt for `git push`, a package install, `docker compose down -v` | Sensitive actions ask | Approve only if you want it |
| Hard deny on `--no-verify`, force-push, `reset --hard`, `rm -rf`, `DROP`, `TRUNCATE` | Never allowed from Claude | Run it yourself if truly needed |

## 11. Edge cases

| Situation | Handling |
|---|---|
| `/freeze-context` with an empty blocking answer | Refuses and lists the open questions |
| Spec and contract disagree | Stop and ask (the profile says which wins) |
| Spec changed after freeze | Never edit `context.md`; restart at `/analyze-spec` |
| Same requirement ID in two specs | Test IDs are `<SPEC-NUMBER>:<LOCAL-ID>` |
| A generic rule contradicts the project | The profile's overrides win; Claude says so in one line |
| Two batches in a layer want the same file | `batch-plan.mjs check` fails the plan; move one batch to a later layer |
| Two migrations in one layer | Warning; timestamps must follow batch-id order |
| A parallel batch fails | Only that batch is re-run, at most twice, then Claude asks |
| A subagent edits a file outside its brief | The orchestrator flags it and stops |
| Out-of-box choice during a batch | Ask, record in `docs/DECISIONS.md`, reference it from the changelog entry |
| Changelog entry missing `Decisions:` | `records` fails; `/verify-and-test` stops |
| Commit question | You answer; "no" leaves the files changed and uncommitted |
| Working tree has changes Claude did not make | `/implement-layer` and the commit step ask first |
| Context passes about 60% | Finish the batch or layer, `/clear`, continue with `/whats-next` |
| Bug is really a spec gap | Logged, never code-fixed, never described as fixed |
| Runbook fails | `/run-manual-verification` stops; the fix is a new plan, not a close |
| Tracker connector not authorised | Claude stops or accepts a pasted ticket; never invents ticket text |
| Tiny change (typo, one-line fix) | Not worth the full path: make it directly with a test; the workflow is for specs and tickets |

## 12. Integrations

Issue tracker, error monitoring, API collections and docs lookup are configured in profile §5. Reads are free; **comments, transitions, creates and edits need the developer's approval**; comment on a bug only after the runbook passes. Prefer CLIs (`gh`, `aws`, `newman`) to MCP servers where they exist: no idle context cost. Keep about five MCP servers per project at most; copy `.mcp.json.example` only for the ones you use.

## 13. Quick reference

| I want to… | Do this |
|---|---|
| Start a new spec | `/analyze-spec <file>`, fill the answers, `/freeze-context`, `/plan-todo`, `approved` |
| See what can run now | `/whats-next` |
| Build a layer in parallel | `/implement-layer N` |
| Build one batch | `/implement-batch N` |
| Check everything | `/verify-and-test`, then your full check command |
| Test manually | Fill the credentials file, `/run-manual-verification` |
| Close out a spec | `/finalize`, then you open the PR |
| Fix one bug | `/fix-jira-bug PROJ-123`, approve, `/run-manual-verification PROJ-123`, `/close-bug PROJ-123` |
| Fix many bugs | `/triage-jira-bugs PROJ-1, PROJ-2` |
| Validate the plan | `node scripts/claude/batch-plan.mjs check docs/todos/<feature>.todo.md` |
| Validate the changelog | `node scripts/claude/batch-plan.mjs records docs/todos/<feature>.implementation-changelog.md` |
| Check the workflow is intact | `node scripts/claude/validate-workflow.mjs` |

## 14. Add a stack preset

Create `presets/<name>/` with `preset.json` (`commands`, `settingsAllow`, `hooksConfig`, `profileFragment`, `skillMapRows`, `filesDir`, `upstreamManifest`), a `profile-fragment.md` (the stack facts for profile §2), `skill-map-rows.md` and a `files/` tree mirroring the repo root (skills, rules, agents). Then `init-project.mjs --stack <name>` applies it. `presets/nestjs-backend/` is the worked example; `.claude/spec-driven/optional/` holds dormant React, Next.js and FastAPI assets you can move into a preset.

## 15. Built-ins, connectors and plugins you can still use

Rule: the repository must work with built-ins and connectors only. Anything a plugin provides is an optional extra on one person's machine, so no command depends on it.

| Feature | Use it for | Notes |
|---|---|---|
| `/goal` | Unattended work against a condition, such as "the verify command passes" | `/clear` removes an active goal |
| `/loop` | Repeating a prompt on an interval | |
| `/batch` | Splitting one change into many worktree-isolated subagents that each open a PR | **Opens PRs**, which conflicts with "never push"; `/implement-layer` is the controlled alternative |
| `/code-review`, `/security-review` | Fresh-eyes review of the diff before the PR | Run `/help` to see whether your install has them |
| `/init`, `/doctor`, `/compact`, `/clear`, `/context`, `/mcp`, `/hooks`, `/memory`, `/permissions`, `/agents` | Setup, health, context, configuration | `/help` is the source of truth |
| Subagents | Delegating a batch with fresh context | `model` takes `sonnet`, `opus`, `haiku`, a full ID or `inherit`; `isolation: worktree` uses a temporary worktree; default 20 concurrent |
| Hooks | Enforcement | Many events exist; we use `SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, optionally `Stop` |
| Skill frontmatter | Control how a skill loads | Unknown keys are ignored; phase tags are stored in `metadata` |
| MCP scopes | Where a server is defined | Local, project (`.mcp.json`), user; claude.ai connectors load when you are logged in |
| Plugins | Optional bundles (skills, agents, commands, hooks, MCP servers) | Fine for personal convenience; do not make the repo depend on one, and review any plugin hook as code |

## 16. Maintenance

Keep `CLAUDE.md` under 200 lines and the profile short. After editing a copied generic file, add a line to `.claude/spec-driven/CHANGES.md`. To take an upstream improvement, diff against `upstream.sha256`, apply the same edit, run `node scripts/claude/validate-workflow.mjs`. Review Claude's auto-memory notes monthly.
