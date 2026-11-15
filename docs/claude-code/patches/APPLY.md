# Applying the hardened guardrails (developer step)

Claude Code cannot edit `.claude/settings.json`, `.claude/hooks/**` or `.claude/hooks.config.json` (the guardrails block it, correctly, and so does the `guardrail-change-review` skill). The hardened versions are here, tested, waiting for you to review and install. Nothing in `.claude/` has been changed by them yet.

Findings fixed: `SEC-01` to `SEC-14` in the archived PLUGIN-FINALIZATION-AUDIT (kept outside the repo).

## 1. Review

```
git diff --no-index .claude/hooks docs/claude-code/patches/hooks
git diff --no-index .claude/settings.json docs/claude-code/patches/settings.json
```

| File | What changed | Findings |
|---|---|---|
| `hooks/lib.mjs` | `GUARDRAIL_VERSION = 2`; baseline protection for the guardrail files built in (settings*.json, hooks/, hooks.config.json) and case-insensitive; `failClosed()` so a crashing guard blocks instead of waving the action through; `run()` no longer uses a shell (path injection on Windows); `collectText()` and `resolveFile()` shared helpers; more secret formats (Stripe live, AWS temporary, npm, GitLab, SendGrid, AWS secret key) | SEC-08, 09, 10 |
| `hooks/guard-bash.mjs` | git global options (`-C`, `-c`) normalised away; `git commit -n`, `HUSKY=0`, `+refspec`/`--delete` pushes; PowerShell and cmd deletes; `find -delete`; `git restore --worktree`, `branch --delete --force`; `.env` blocked for any command that is not a known consumer (docker, git, ls); the shell can no longer rewrite the guardrail files; new asks (stash drop, DELETE without WHERE, migration reset, more installers, printenv); the flag text in `grep` no longer blocks | SEC-01 to 05, 13 |
| `hooks/guard-edits.mjs` | scans MultiEdit `edits[]` and NotebookEdit `new_source`; resolves relative paths; optional `askFiles`; fails closed | SEC-06, 07, 09 |
| `hooks/owasp-guard.mjs` | indirect eval, unsafe `yaml.load`, workflow `${{ github.event.* }}` inside `run:`, Dockerfile `curl \| sh`, weak randomness for tokens, bcrypt cost, string `setTimeout`, request values into file or URL calls, CORS reflect with credentials, `pickle`; scans NotebookEdit text | SEC-12 |
| `hooks/stop-gate.mjs` | honours `stop_hook_active` for an unchanged failure; comment corrected (Claude Code's cap is 8) | SEC-14 |
| `hooks/post-edit.mjs`, `hooks/session-start.mjs`, `hooks/secret-guard.mjs` | records NotebookEdit paths; dead `work-collisions.mjs` call removed and the guardrail skill pointed out; secret-guard unchanged (new patterns come from `lib.mjs`) | SEC-14 |
| `settings.json` | `disableBypassPermissionsMode`; `.env.*` deny replaced by explicit names so `.env.example` stays readable; more credential paths denied; `Edit(...)` deny rules for the guardrail files (also cover `tee`, `sed` and `>` redirections); `NotebookEdit` in the PostToolUse matcher; `audit-settings` allowed | SEC-05, 06, 11 |

## 2. Prove it before installing

```
HOOKS_DIR=docs/claude-code/patches/hooks node scripts/claude/tests/hooks.test.mjs
```

Expected: `... passed, 0 failed  [strict]`. (PowerShell: `$env:HOOKS_DIR="docs/claude-code/patches/hooks"; node scripts/claude/tests/hooks.test.mjs`.) The same table run against the installed hooks prints the open gaps as `TODO`.

## 3. Install (from the repo root, in your own terminal, not through Claude)

```
cp docs/claude-code/patches/hooks/*.mjs .claude/hooks/          # PowerShell: Copy-Item docs\claude-code\patches\hooks\*.mjs .claude\hooks\ -Force
```

For `settings.json`, do not overwrite blindly: an init preset may have added project-specific `allow` rules. Apply the diff from step 1 by hand, or copy the file if you have no local additions. Commit before and after so rollback is `git revert`.

## 4. Verify

```
node scripts/claude/tests/hooks.test.mjs          # strict automatically now (GUARDRAIL_VERSION 2)
node scripts/claude/validate-workflow.mjs         # the two settings WARNs disappear
node scripts/claude/audit-settings.mjs .claude/settings.json
```

Start a new Claude Code session so the hooks and permissions reload, then try a harmless blocked command (for example `git commit -n`) to see the new message.

## 4b. Frozen specs and ask-first files (`hooks.config.json`)

`docs/claude-code/patches/hooks.config.json` is the proposed config. Install it the same way as `settings.json` (review the diff, copy, commit).

- **Frozen specs.** `immutableDirs` gains `/specs/` and `immutableFileRegex` gains `/specs/[^/]+/(spec-subset|context)\.md$`; the code clause (`\.(ts|js|sql)$`) gets a `^(?!.*/specs/)` lookahead so a committed `.ts` file that merely lives in a folder called `specs` is **not** frozen. This uses the rule that already exists for migrations: a file that is **already committed** cannot be edited, a **new** file can. So `/analyze-spec` and `/freeze-context` still create `spec-subset.md` and `context.md`; once they are committed they are frozen. `analysis.md` stays editable (its answers are filled in after commit). Consequence: to re-run `/analyze-spec` on a spec whose slice is already committed, you remove or version that committed file yourself. The frozen-spec cases in `hooks.test.mjs` pass on the installed hooks too, because the mechanism is not new; only this config line is.
- **Ask-first files.** `askFiles` makes edits to `CLAUDE.md`, `.claude/(agents|commands|rules|skills)/`, `.github/workflows/` and `scripts/claude/` ask for a person's confirmation instead of passing silently. This needs the hardened `guard-edits.mjs` (step 3). Expect prompts while maintaining this boilerplate itself: that is the point.
- The NestJS and React presets already carry the same spec protection in `preset.json`, so a project created with `init` gets it without this patch.

## 4c. macOS, Linux and Windows

Everything here is Node-only with no shell (`run()` spawns `git` and `node` directly), paths are normalised, and the PowerShell and cmd rules in `guard-bash.mjs` are harmless on macOS. `claude-workflow.yml` runs the validator and every test suite on `ubuntu-latest`, `macos-latest` and `windows-latest`, which is the real check: after you push a throwaway branch, look at all three jobs. On your Mac, also run the four per-file commands once: `node scripts/claude/tests/hooks.test.mjs`, `node scripts/claude/tests/batch-plan.test.mjs`, `node scripts/claude/tests/agent-tools.test.mjs` and `node scripts/claude/tests/init.test.mjs`.

## 5. Optional, not applied

- `askFiles` is already part of the `hooks.config.json` patch (section 4b): edits to `CLAUDE.md`, `.claude/agents|commands|rules|skills/`, `.github/workflows/` and `scripts/claude/` ask for a person's confirmation. If the prompts become noise while you maintain this boilerplate, delete the `askFiles` block from the installed config; the hooks do not need it.
- **The Claude Code sandbox** (OS-level file and network limits) is the only control that also stops scripts Claude runs from touching protected paths; the docs say Bash rules and hooks cannot. It runs on **macOS** (nothing to install), **Linux and WSL2** (needs `bubblewrap` and `socat`). **Native Windows runs commands unsandboxed**: to get it on a Windows machine, run Claude Code inside WSL2. `sandbox.settings.example.json` is a starting point to merge into your own settings (it is an example, not a drop-in file). Notes: the `Edit(...)` deny rules in the patched `settings.json` are merged into the sandbox's write-deny list by Claude Code, so the guardrail files become OS-protected without repeating them; `failIfUnavailable` is `false` in the example because `true` would stop every Bash command on a machine where the sandbox cannot start (native Windows). Teams on Mac and WSL2 can set it to `true`. Start with `/sandbox` in a session on your Mac and watch what it prompts for before widening `allowedDomains`.

## Rollback

`git checkout -- .claude/hooks .claude/settings.json` (or `git revert` the commit). The installed hooks keep working; the table goes back to showing the gaps as `TODO`.
