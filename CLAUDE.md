# {{PROJECT_NAME}}: working guide

{{ONE_LINE_DESCRIPTION}}

Follow this guide for all work in this repo. Details live in `.claude/rules/` and `.claude/project-profile.md`; this file stays short. Keep it under 200 lines: if Claude already does something right without being told, delete the line.

## Commands

| Task | Command |
|---|---|
| Install | {{INSTALL_COMMAND}} |
| Build | {{BUILD_COMMAND}} |
| Lint | {{LINT_COMMAND}} |
| Test | {{TEST_COMMAND}} |
| Full check before a PR | {{VERIFY_COMMAND}} |
| Check the Claude workflow files | `node scripts/claude/validate-workflow.mjs` |

## Core rules

- Follow the active spec exactly. Keep changes inside the requested scope. Write simple, readable code.
- Validate all external input. Never silently swallow errors. Tests must give real confidence.
- **Security (OWASP) is non-negotiable** for every change, stack and command: authenticate and authorize by ownership in the query, validate input, parameterized queries, no secrets in code or logs. Details in `.claude/rules/security-floor.md`. Run the `security-reviewer` agent before calling code work done.
- **Changing the guardrails** (hooks, `settings.json`, commands, agents, skills, `scripts/claude`, presets, CI): load the `guardrail-change-review` skill first and finish its gate (regression case, tests, `validate-workflow`, `security-reviewer`). Protected files are changed by the developer from a patch you write, never by you.
- **Ask before** adding a dependency, changing a shipped migration or contract, deleting data, or doing anything outside the task.
- **Never** put secrets, tokens, passwords or customer data in prompts, commands, files, permission rules or logs. Use environment variables and document them in `.env.example`.
- **Never** push without asking, and never force-push, amend, `reset --hard`, or bypass hooks (`--no-verify`). Commits follow the commit policy below.
- Jira, Sentry and other tracker writes (comment, transition, create, resolve) need the developer's approval.
- Do not touch unrelated files. A dirty working tree may hold someone else's work.

## How work flows (spec-driven)

Nothing is implemented before the plan is approved.

| You want to | Run | Produces |
|---|---|---|
| Understand a new spec or changelog | `/analyze-spec` | `specs/<folder>/analysis.md` with questions |
| Lock the answers | `/freeze-context` | `context.md` (refuses while a BLOCKING answer is empty) |
| Plan the work | `/plan-todo` (then reply `approved`) | layered TODO, contracts, batch briefs, implementation changelog, runbook |
| See what is next | `/whats-next` | read-only status and the next runnable batches |
| Build | `/implement-layer N` (parallel) or `/implement-batch N` | code, tests, TODO status, changelog entry |
| Verify against the spec | `/verify-and-test` | one verification report |
| Test it live | `/run-manual-verification` | runbook results |
| Close the spec | `/finalize` | module file history, PR description |
| Fix a ticket | `/fix-jira-bug KEY` then `/run-manual-verification KEY` then `/close-bug KEY` | plan, fix, runbook, Jira comment draft |
| Many tickets | `/triage-jira-bugs` | triage file, gated fixes |
| A small ticket, no formal spec | `/plan-ticket KEY` | one-pass plan, build, runbook — no batches, no layers |
| Open a PR | `/create-pr` | drafted title and description, opened PR (or a `gh` command to approve) |
| Review a PR | `/review-pr <number or branch>` | a findings report, picking the right depth for the stack |

Start each phase in a fresh session; hand over through the files, not the chat. Every command and agent says which Claude model to use — see each file's **Model:** line.

## Records (what must be written down)

- **Implementation changelog per spec** (`docs/todos/<feature>.implementation-changelog.md`): done, in progress, to do; dated entries; spec version; `Decisions:` and `Deviations:` references.
- **Module file** (`src/<module>/<module>.module.md`): living description of the module with an append-only `Change History`.
- **Decisions log** (`docs/DECISIONS.md`): any choice the spec, contract and profile do not dictate gets an ID (`D-<SPEC-NUMBER or TICKET>-<nn>`) and is referenced from the changelog entry.
- Specs are never edited after freeze. A changed spec starts again at `/analyze-spec`.

## Commit policy

`commit_policy` in the profile decides. Default `ask`: show the files and the proposed message, and let the developer answer yes, edit or no. Never commit a red batch. Stage files by name.

## Conventions

- Code conventions: `.claude/rules/` (stack rules are added by the preset you chose at init).
- Project facts, paths and overrides of the generic workflow: `.claude/project-profile.md`. The profile, this file and the rules override any generic workflow rule.
- Hooks enforce what must always hold (secrets, protected files, destructive commands). See `.claude/hooks.config.json`. If a hook blocks something, change the approach; do not work around it.

## When the context is compacted

Keep: the active spec and batch, the list of modified files, the test commands, and open decisions. Re-read the active TODO and implementation changelog before continuing.

## Local overrides

Personal notes go in `CLAUDE.local.md` (gitignored; copy from `CLAUDE.local.md.example`).
