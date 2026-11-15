# Stack presets

A preset is what turns the generic workflow into a stack-specific one. `node scripts/claude/init-project.mjs --stack <name>` applies exactly one and deletes the others.

| Preset | Adds |
|---|---|
| `nestjs-backend` | `nestjs-backend` skill (8 files), `nestjs-batch-implementer` agent, rules `api-conventions`, `database-migrations`, `testing`, hook parameters (TypeScript source, immutable `src/migrations/`, prettier, eslint and jest in the Stop gate), allow patterns for jest, and a stack section for the profile |
| `react-nextjs` | `react-frontend` and `nextjs-frontend` skills, `react-batch-implementer` agent, rules `component-conventions`, `testing`, hook parameters (TS/TSX source, no immutable dirs, prettier, eslint and vitest in the Stop gate), allow patterns for vitest/jest, and a stack section for the profile. Use `nextjs-frontend` for an App Router project, `react-frontend` otherwise — both ship so a project switching later isn't missing one |
| `generic` | Nothing: no stack assumptions. You fill the profile's stack section and add your own skills and rules |

## Anatomy of a preset

```
presets/<name>/
  preset.json            commands, settingsAllow, hooksConfig, profileFragment, skillMapRows, filesDir, upstreamManifest
  profile-fragment.md    bullets that replace the stack marker in profile section 2
  skill-map-rows.md      table rows appended to the skill map in profile section 8
  upstream.sha256        optional: pristine hashes of copied upstream files (appended to the base manifest)
  files/                 mirrors the repo root: .claude/skills, .claude/rules, .claude/agents ...
```

`preset.json` keys:

| Key | Meaning |
|---|---|
| `commands` | Values for `INSTALL_COMMAND`, `BUILD_COMMAND`, `LINT_COMMAND`, `TEST_COMMAND`, `VERIFY_COMMAND` in `CLAUDE.md` (flags on init override them) |
| `settingsAllow` | Extra `permissions.allow` patterns (patterns only, never values) |
| `hooksConfig` | Merged over `.claude/hooks.config.json` (see the guide, section 3.6) |

## Adding a preset

1. Copy `presets/generic/` to `presets/<name>/` and fill `preset.json`.
2. Put stack skills, rules and agents under `files/`. Give each skill `metadata.phases` and `metadata.use_when` in its frontmatter and a profile preamble (copy one from an existing skill).
3. Write `profile-fragment.md` with the stack facts, marking unverified ones `(verify)`.
4. Run `node scripts/claude/tests/init.test.mjs` and a manual `--dry-run`. The tests cover the two shipped presets; add cases for yours.

Candidates not built: `fastapi` (a stub skill and agent are in `.claude/spec-driven/optional/`), Java and Flutter. They have not been exercised with this workflow.
