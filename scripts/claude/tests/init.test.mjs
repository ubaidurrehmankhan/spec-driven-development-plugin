// Behaviour tests for scripts/claude/init-project.mjs. Works on throwaway copies; skipped once a project has been initialised.
// Usage: node scripts/claude/tests/init.test.mjs
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '..', '..', '..');
if (!existsSync(path.join(ROOT, 'presets')) || existsSync(path.join(ROOT, '.claude', 'spec-driven', 'init.json'))) {
  console.log('SKIP  this project is already initialised (presets/ removed or init.json present)');
  process.exit(0);
}

let pass = 0;
let fail = 0;
const t = (name, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : `  ${extra}`}`);
  cond ? pass++ : fail++;
};
const fresh = () => {
  const d = mkdtempSync(path.join(tmpdir(), 'init-test-'));
  cpSync(ROOT, d, { recursive: true, filter: (s) => !/node_modules|[\\/]\.git([\\/]|$)/.test(s) });
  return d;
};
const node = (cwd, ...a) => spawnSync(process.execPath, a, { cwd, encoding: 'utf8' });
const init = (cwd, ...a) => node(cwd, 'scripts/claude/init-project.mjs', ...a);
const read = (d, f) => readFileSync(path.join(d, f), 'utf8');
const has = (d, f) => existsSync(path.join(d, f));

// nestjs preset
const A = fresh();
let r = init(A, '--name', 'Demo Portal', '--jira-key', 'demo', '--stack', 'nestjs', '--description', 'Demo API.');
t('nestjs init exits 0', r.status === 0, r.stdout + r.stderr);
t('nestjs rules copied', has(A, '.claude/rules/api-conventions.md') && has(A, '.claude/rules/database-migrations.md') && has(A, '.claude/rules/testing.md'));
t('nestjs skills and agent copied', has(A, '.claude/skills/nestjs-backend/SKILL.md') && has(A, '.claude/skills/database-design/SKILL.md') && has(A, '.claude/agents/nestjs-batch-implementer.md'));
t('nestjs quality gates copied', has(A, '.github/workflows/ci.yml') && has(A, 'commitlint.config.cjs') && has(A, '.husky/pre-commit') && has(A, '.claude/rules/architecture.md') && has(A, '.claude/agents/nestjs-pr-reviewer.md'));
t('nestjs hygiene files installed (env names, code owners, dependabot, node version)', has(A, '.env.example') && !has(A, '_dot_env.example') && has(A, '.github/CODEOWNERS') && has(A, '.github/dependabot.yml') && has(A, '.nvmrc'));
t('.env.example holds names only, never a value', read(A, '.env.example').split('\n').filter((l) => /^[A-Z_]+=/.test(l)).every((l) => /^[A-Z_]+=$/.test(l)), read(A, '.env.example'));
t('CODEOWNERS says the placeholder team must be replaced', /@your-org\/your-team/.test(read(A, '.github/CODEOWNERS')) && /Require review from Code Owners/.test(read(A, '.github/CODEOWNERS')));
t('copied CI pins every third-party action to a full SHA and has no licence-gated action', [...read(A, '.github/workflows/ci.yml').matchAll(/uses:\s*(\S+)@(\S+)/g)].every((m) => /^[0-9a-f]{40}$/.test(m[2])) && !/gitleaks-action/.test(read(A, '.github/workflows/ci.yml').replace(/#.*$/gm, '')) && /dependency-review-action/.test(read(A, '.github/workflows/ci.yml')));
t('security floor installed: rule, reviewer agent, guard hook, depth skills', has(A, '.claude/rules/security-floor.md') && has(A, '.claude/agents/security-reviewer.md') && has(A, '.claude/hooks/owasp-guard.mjs') && has(A, '.claude/skills/transactional-correctness/SKILL.md') && has(A, '.claude/skills/backend-router/SKILL.md'));
const cfg = JSON.parse(read(A, '.claude/hooks.config.json'));
t('hooks config merged', cfg.sourceFileRegex === '/src/.+\\.ts$' && cfg.immutableDirs[0] === '/src/migrations/' && cfg.stopGate.checks.length === 3, JSON.stringify(cfg));
t('frozen-spec protection arrives with the nestjs preset (folder and clause, migrations still covered)', cfg.immutableDirs.includes('/specs/') && /spec-subset\|context/.test(cfg.immutableFileRegex) && /\(ts\|sql\)/.test(cfg.immutableFileRegex), JSON.stringify([cfg.immutableDirs, cfg.immutableFileRegex]));
t('settings allow extended', JSON.parse(read(A, '.claude/settings.json')).permissions.allow.includes('Bash(npx jest *)'));
r = node(A, 'scripts/claude/agent-tools.mjs', 'check');
t('agent deny lists are in step with the policy after init', r.status === 0 && /nestjs-batch-implementer/.test(r.stdout), r.stdout);
t('CLAUDE.md filled', !/\{\{[A-Z_]+\}\}/.test(read(A, 'CLAUDE.md')) && read(A, 'CLAUDE.md').includes('# Demo Portal: working guide') && read(A, 'CLAUDE.md').includes('`npm ci`'));
const prof = read(A, '.claude/project-profile.md');
t('profile filled', !/\{\{[A-Z_]+\}\}/.test(prof) && !prof.includes('<!-- preset') && prof.includes('Demo Portal') && prof.includes('DEMO-123') && prof.includes('`nestjs-backend` | planning'), prof.slice(0, 200));
t('profile stack section placed before checklist', prof.indexOf('**Stack (verify):**') > 0 && prof.indexOf('**Stack (verify):**') < prof.indexOf('Still to state'));
t('unused preset removed', !has(A, 'presets/generic') && has(A, 'presets/nestjs-backend'));
t('state file written', JSON.parse(read(A, '.claude/spec-driven/init.json')).stack === 'nestjs-backend');
r = node(A, 'scripts/claude/validate-workflow.mjs');
t('validator passes after init', r.status === 0 && /20 skills, 10 agents/.test(r.stdout) && /0 missing/.test(r.stdout), r.stdout);
r = node(A, 'scripts/claude/audit-settings.mjs', '.claude/settings.json');
t('settings audit clean', r.status === 0 && /secret-like rules: none/.test(r.stdout), r.stdout + r.stderr);
r = node(A, 'scripts/claude/tests/hooks.test.mjs');
t('hooks tests pass in initialised copy', r.status === 0, r.stdout.slice(-300));
r = node(A, 'scripts/claude/tests/batch-plan.test.mjs');
t('batch-plan tests pass in initialised copy', r.status === 0, r.stdout.slice(-300));
r = init(A, '--name', 'Demo Portal', '--stack', 'nestjs');
t('second run refuses without --force', r.status === 1 && /already initialised/.test(r.stderr), r.stderr);
rmSync(A, { recursive: true, force: true });

// generic preset
const B = fresh();
r = init(B, '--name', 'Plain Project', '--stack', 'generic');
t('generic init exits 0', r.status === 0, r.stdout + r.stderr);
t('generic adds no stack skills', !has(B, '.claude/skills/nestjs-backend') && !has(B, '.claude/rules/api-conventions.md'));
t('generic keeps hooks config empty', JSON.parse(read(B, '.claude/hooks.config.json')).sourceFileRegex === null);
t('generic leaves commands to fill in', read(B, 'CLAUDE.md').includes('_(fill in)_'));
t('generic removes other presets', !has(B, 'presets/nestjs-backend'));
r = node(B, 'scripts/claude/validate-workflow.mjs');
t('validator passes after generic init', r.status === 0 && /18 skills, 8 agents/.test(r.stdout) && /skill "nestjs-backend", which is not installed/.test(r.stdout), r.stdout);
rmSync(B, { recursive: true, force: true });

// react-nextjs preset
const D = fresh();
r = init(D, '--name', 'Demo App', '--jira-key', 'demo', '--stack', 'react-nextjs', '--description', 'Demo frontend.');
t('react-nextjs init exits 0', r.status === 0, r.stdout + r.stderr);
t('react-nextjs rules copied', has(D, '.claude/rules/component-conventions.md') && has(D, '.claude/rules/testing.md'));
t('react-nextjs skills and agent copied', has(D, '.claude/skills/react-frontend/SKILL.md') && has(D, '.claude/skills/nextjs-frontend/SKILL.md') && has(D, '.claude/agents/react-batch-implementer.md'));
t('react-nextjs hygiene files installed', has(D, '.env.example') && !has(D, '_dot_env.example') && has(D, '.github/CODEOWNERS') && has(D, '.github/dependabot.yml') && /NEXT_PUBLIC_API_BASE_URL=\s*$/m.test(read(D, '.env.example')));
const dcfg = JSON.parse(read(D, '.claude/hooks.config.json'));
t('hooks config merged for react-nextjs', dcfg.sourceFileRegex === '/(src|app)/.+\\.(ts|tsx)$' && dcfg.stopGate.checks.length === 3, JSON.stringify(dcfg));
t('react-nextjs keeps a narrow immutable rule (frozen specs only, never every committed file)', dcfg.immutableDirs.includes('/specs/') && dcfg.immutableFileRegex !== '' && /spec-subset\|context/.test(dcfg.immutableFileRegex), JSON.stringify([dcfg.immutableDirs, dcfg.immutableFileRegex]));
t('settings allow extended for react-nextjs', JSON.parse(read(D, '.claude/settings.json')).permissions.allow.includes('Bash(npx vitest *)'));
r = node(D, 'scripts/claude/validate-workflow.mjs');
t('validator passes after react-nextjs init', r.status === 0 && /0 missing/.test(r.stdout), r.stdout);
r = node(D, 'scripts/claude/tests/hooks.test.mjs');
t('hooks tests pass in react-nextjs copy', r.status === 0, r.stdout.slice(-300));
rmSync(D, { recursive: true, force: true });

// dry run and errors
const C = fresh();
r = init(C, '--name', 'X', '--stack', 'nestjs', '--dry-run');
t('dry run exits 0 and writes nothing', r.status === 0 && /\[dry run\]/.test(r.stdout) && !has(C, '.claude/spec-driven/init.json') && !has(C, '.claude/project-profile.md') && has(C, 'presets/generic'), r.stdout);
r = init(C, '--stack', 'nestjs');
t('missing --name fails', r.status === 1 && /--name/.test(r.stderr));
r = init(C, '--name', 'X', '--stack', 'cobol');
t('unknown stack fails and lists presets', r.status === 1 && /Available: .*generic/.test(r.stderr), r.stderr);
r = init(C, '--name', 'X', '--jira-key', 'a b');
t('bad jira key fails', r.status === 1 && /jira-key/.test(r.stderr));
// a stack name becomes a path and every other preset folder is deleted: it must be a plain name
r = init(C, '--name', 'X', '--stack', '../../etc');
t('stack with path characters is refused', r.status === 1 && /plain preset name/.test(r.stderr) && has(C, 'presets/nestjs-backend') && has(C, 'presets/generic'), r.stderr);
r = init(C, '--name', 'X', '--stack', 'NESTJS-Backend');
t('stack must be lowercase plain name', r.status === 1, r.stderr);
rmSync(C, { recursive: true, force: true });

// merge, not replace: protection the project already has survives init; a filled-in profile survives --force
const E = fresh();
const customCfg = { policyFiles: [{ patterns: ['/custom/policy\\.ts$'], message: 'Blocked: {file}' }], immutableDirs: ['/custom/shipped/'], stopGate: { checks: [{ label: 'mine', pkg: 'mine', args: [] }] } };
writeFileSync(path.join(E, '.claude', 'hooks.config.json'), JSON.stringify(customCfg));
r = init(E, '--name', 'Merge Demo', '--stack', 'nestjs');
t('init with an existing hooks config exits 0', r.status === 0, r.stdout + r.stderr);
const mcfg = JSON.parse(read(E, '.claude/hooks.config.json'));
t('own policyFiles kept after init', mcfg.policyFiles.some((p) => p.patterns.includes('/custom/policy\\.ts$')), JSON.stringify(mcfg.policyFiles));
t('own immutableDirs kept and the preset folders added', mcfg.immutableDirs.includes('/custom/shipped/') && mcfg.immutableDirs.includes('/src/migrations/') && mcfg.immutableDirs.includes('/prisma/migrations/'), JSON.stringify(mcfg.immutableDirs));
t('own stop-gate check kept next to the preset checks', mcfg.stopGate.checks.some((c) => c.label === 'mine') && mcfg.stopGate.checks.length === 4, JSON.stringify(mcfg.stopGate.checks.map((c) => c.label)));
t('sql migrations are immutable too', /sql/.test(mcfg.immutableFileRegex), mcfg.immutableFileRegex);
writeFileSync(path.join(E, '.claude', 'project-profile.md'), `${read(E, '.claude/project-profile.md')}\nMY HAND-WRITTEN PROJECT FACT\n`);
r = init(E, '--name', 'Merge Demo', '--stack', 'nestjs', '--force');
t('--force keeps a filled-in profile', r.status === 0 && read(E, '.claude/project-profile.md').includes('MY HAND-WRITTEN PROJECT FACT') && /already filled in/.test(r.stdout), r.stdout);
r = init(E, '--name', 'Merge Demo', '--stack', 'nestjs', '--force', '--reset-profile');
t('--reset-profile regenerates it and keeps a backup', r.status === 0 && !read(E, '.claude/project-profile.md').includes('MY HAND-WRITTEN') && read(E, '.claude/project-profile.md.bak').includes('MY HAND-WRITTEN PROJECT FACT'), r.stdout);
r = init(E, '--name', 'Merge Demo', '--stack', 'nestjs', '--force', '--reset-profile');
t('a second reset keeps the first backup and adds a timestamped one', r.status === 0 && read(E, '.claude/project-profile.md.bak').includes('MY HAND-WRITTEN PROJECT FACT') && readdirSync(path.join(E, '.claude')).filter((n) => /^project-profile\.md\.\d+\.bak$/.test(n)).length === 1, r.stdout);
rmSync(E, { recursive: true, force: true });

// --reset-profile works without --force when init has not run yet (a profile exists, init.json does not)
const G = fresh();
writeFileSync(path.join(G, '.claude', 'project-profile.md'), '# my own profile\nHAND-WRITTEN\n');
r = init(G, '--name', 'Reset Alone', '--stack', 'generic', '--reset-profile');
t('--reset-profile alone regenerates the profile and keeps a backup', r.status === 0 && !read(G, '.claude/project-profile.md').includes('HAND-WRITTEN') && read(G, '.claude/project-profile.md.bak').includes('HAND-WRITTEN'), r.stdout + r.stderr);
rmSync(G, { recursive: true, force: true });

// a malformed settings.json stops init before anything is written
const F = fresh();
writeFileSync(path.join(F, '.claude', 'settings.json'), '{ "permissions": ');
r = init(F, '--name', 'Broken', '--stack', 'nestjs');
t('malformed settings.json fails with a clear message', r.status === 1 && /settings\.json is not valid JSON/.test(r.stderr), r.stderr);
t('...and leaves nothing half-initialised', !has(F, '.claude/spec-driven/init.json') && !has(F, '.claude/project-profile.md') && has(F, 'presets/nestjs-backend') && has(F, 'presets/generic'));
rmSync(F, { recursive: true, force: true });

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
