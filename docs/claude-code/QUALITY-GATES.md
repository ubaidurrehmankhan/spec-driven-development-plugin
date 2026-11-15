# Quality gates: what runs where

Each rule is enforced at the cheapest point that can catch it. Prose in `CLAUDE.md` guides; these gates enforce.

| Gate | When | What it checks | Where it is set up |
|---|---|---|---|
| Edit guard | Before every file write | `.env*`, shipped migrations, policy files, the guardrail files, secrets in content | `.claude/hooks/guard-edits.mjs`, `hooks.config.json` |
| OWASP guard | Before every source-file write | Blocks `eval`, disabled TLS verification, JWT `none` or ignored expiry, SQL and shell built by string; asks on raw HTML, weak hashes, wildcard CORS, logged secrets | `.claude/hooks/owasp-guard.mjs` |
| Command guard | Before every shell command (Bash and PowerShell) | Destructive git, `rm -rf`, destructive SQL, `.env` reads, literal secrets, `curl \| sh` | `.claude/hooks/guard-bash.mjs` |
| Prompt guard | On every prompt | JWTs, API keys, private keys, connection strings, literal passwords | `.claude/hooks/secret-guard.mjs` |
| Format on edit | After every edit | Prettier on the edited file | `post-edit.mjs`, preset `hooksConfig.format` |
| Stop gate | When Claude finishes a turn | ESLint, `tsc --noEmit`, related tests on files edited this session; a missing tool is reported as "NOT RUN" | `stop-gate.mjs`, preset `hooksConfig.stopGate` |
| Plan check | When a plan is written | Every batch lists `owasp-security`, or the plan fails | `scripts/claude/batch-plan.mjs check` |
| Security review | After each layer, at verification, on PR review, on bug fixes | OWASP review of the diff; CRITICAL and HIGH block | `.claude/agents/security-reviewer.md` |
| Pre-commit | `git commit` | lint-staged (ESLint, Prettier), gitleaks on staged changes | `.husky/pre-commit`, `.lintstagedrc.json` |
| Commit message | `git commit` | `type(scope): summary (TICKET)` | `.husky/commit-msg`, `commitlint.config.cjs` |
| CI | Pull request | install, lint, typecheck, test, build, gitleaks, `npm audit` | `.github/workflows/ci.yml` |
| Workflow CI | Pull request touching `.claude/` | Workflow validator and the three script test suites | `.github/workflows/claude-workflow.yml` |

## One-time setup in an app repo (needs approval to add dependencies)

```
npm i -D husky lint-staged @commitlint/cli @commitlint/config-conventional typescript eslint prettier
npx husky init
```

Then make sure `package.json` has `typecheck` (`tsc --noEmit`), `lint`, `test` and `build` scripts and that `verify` chains them. Install `gitleaks` locally (optional; CI always scans).

## Layering lint (NestJS)

Add this to the project's ESLint config so controller-to-database shortcuts fail the build:

```js
{
  files: ['src/**/*.controller.ts'],
  rules: {
    'no-restricted-imports': ['error', {
      patterns: [
        { group: ['**/*.repository', '**/*.entity', 'typeorm'], message: 'Controllers call services, not repositories or the ORM.' },
      ],
    }],
  },
}
```

For Next.js, add the equivalent for client components importing server-only modules (`import 'server-only'` in those modules makes the build fail on misuse).

## Plugin collision

This kit vendors the spec-driven commands, skills and agents as plain project files. Do not also enable the `spec-driven-web-plugin` plugin in the same project: both define `/analyze-spec`, `/plan-todo` and the others, and the plugin copy has no project profile preamble.
