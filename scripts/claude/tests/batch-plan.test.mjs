// Behaviour tests for scripts/claude/batch-plan.mjs. Uses a temp folder, so it runs in any repo.
// Usage: node scripts/claude/tests/batch-plan.test.mjs
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.resolve(here, '..', 'batch-plan.mjs');
const dir = mkdtempSync(path.join(tmpdir(), 'bp-'));
const SKILLS = path.join(dir, 'skills');
for (const s of ['nestjs-backend', 'database-design', 'owasp-security']) {
  mkdirSync(path.join(SKILLS, s), { recursive: true });
  writeFileSync(path.join(SKILLS, s, 'SKILL.md'), `---\nname: ${s}\n---\n`);
}
mkdirSync(path.join(dir, 'docs/todos/f.briefs'), { recursive: true });
for (const n of ['1', '2', '3', '4']) writeFileSync(path.join(dir, `docs/todos/f.briefs/batch-${n}.md`), 'brief');

const run = (args) => spawnSync(process.execPath, [SCRIPT, ...args], { cwd: dir, encoding: 'utf8' });
let pass = 0, fail = 0;
const t = (name, cond, extra = '') => { if (cond) { pass++; console.log('PASS ', name); } else { fail++; console.log('FAIL ', name, extra); } };

const batch = (id, over = {}) => ({
  id, goal: `goal ${id}`, deliverable: 'D0', dependsOn: [], model: 'sonnet', stack: 'backend-nestjs', todos: 2,
  files: { create: [`src/m${id}/a.ts`], modify: [] }, migrations: 0,
  skills: { planning: ['nestjs-backend'], implementation: ['nestjs-backend', 'database-design', 'owasp-security'], verification: ['owasp-security'] },
  brief: `docs/todos/f.briefs/batch-${id}.md`, status: 'todo', commit: null, specClauses: ['§1'], owner: 'AI', securityNotes: '', ...over,
});
const planOf = (layers) => ({ feature: 'f', spec: 'specs/x.md', specVersion: '1.0', delivery: 'A', updated: '2026-01-01', layers });
const todo = (plan) => `# F TODO\n\nSome text\n\n\`\`\`batch-plan\n${JSON.stringify(plan, null, 2)}\n\`\`\`\n\nmore text\n`;
const write = (name, plan) => { const p = path.join(dir, name); writeFileSync(p, todo(plan)); return name; };

const good = planOf([
  { layer: 0, name: 'Foundation', batches: [batch('1'), batch('2')] },
  { layer: 1, name: 'Services', batches: [batch('3', { dependsOn: ['1', '2'] }), batch('4', { dependsOn: ['1'] })] },
]);
let r = run(['check', write('good.md', good), '--skills-dir', SKILLS]);
t('valid plan passes', r.status === 0 && /OK: 4 batches in 2 layer/.test(r.stdout), r.stdout + r.stderr);

r = run(['check', write('overlap.md', planOf([{ layer: 0, name: 'x', batches: [batch('1'), batch('2', { files: { create: ['src/m1/a.ts'], modify: [] } })] }])), '--skills-dir', SKILLS]);
t('same-layer file overlap fails', r.status === 1 && /share files/.test(r.stdout), r.stdout);

r = run(['check', write('samelayerdep.md', planOf([{ layer: 0, name: 'x', batches: [batch('1'), batch('2', { dependsOn: ['1'] })] }])), '--skills-dir', SKILLS]);
t('dependency in same layer fails', r.status === 1 && /lower layer/.test(r.stdout), r.stdout);

r = run(['check', write('unknowndep.md', planOf([{ layer: 0, name: 'x', batches: [batch('1', { dependsOn: ['9'] })] }])), '--skills-dir', SKILLS]);
t('unknown dependency fails', r.status === 1 && /unknown batch 9/.test(r.stdout), r.stdout);

r = run(['check', write('badskill.md', planOf([{ layer: 0, name: 'x', batches: [batch('1', { skills: { implementation: ['no-such-skill'] } })] }])), '--skills-dir', SKILLS]);
t('unknown skill fails', r.status === 1 && /no-such-skill/.test(r.stdout), r.stdout);

r = run(['check', write('noskill.md', planOf([{ layer: 0, name: 'x', batches: [batch('1', { skills: { implementation: [] } })] }])), '--skills-dir', SKILLS]);
t('empty implementation skills fails', r.status === 1 && /at least one skill/.test(r.stdout), r.stdout);
r = run(['check', write('noowasp.md', planOf([{ layer: 0, name: 'x', batches: [batch('1', { skills: { planning: [], implementation: ['nestjs-backend'], verification: [] } })] }])), '--skills-dir', SKILLS]);
t('batch without owasp-security fails (security floor)', r.status === 1 && /must include owasp-security/.test(r.stdout), r.stdout);

r = run(['check', write('manyfiles.md', planOf([{ layer: 0, name: 'x', batches: [batch('1', { files: { create: ['a1', 'a2', 'a3', 'a4'], modify: ['b1', 'b2', 'b3'] } })] }])), '--skills-dir', SKILLS]);
t('too many files fails', r.status === 1 && /7 files/.test(r.stdout), r.stdout);

r = run(['check', write('manytodos.md', planOf([{ layer: 0, name: 'x', batches: [batch('1', { todos: 4 })] }])), '--skills-dir', SKILLS]);
t('too many TODOs fails', r.status === 1 && /4 TODOs/.test(r.stdout), r.stdout);

r = run(['check', write('emptyclause.md', planOf([{ layer: 0, name: 'x', batches: [batch('1', { specClauses: [] })] }])), '--skills-dir', SKILLS]);
t('empty specClauses fails', r.status === 1 && /specClauses must list/.test(r.stdout), r.stdout);

r = run(['check', write('noclausefield.md', planOf([{ layer: 0, name: 'x', batches: [batch('1', { specClauses: undefined })] }])), '--skills-dir', SKILLS]);
t('missing specClauses (legacy plan) warns but passes', r.status === 0 && /no specClauses/.test(r.stdout), r.stdout);

r = run(['check', write('badowner.md', planOf([{ layer: 0, name: 'x', batches: [batch('1', { owner: 'robot' })] }])), '--skills-dir', SKILLS]);
t('unknown owner fails', r.status === 1 && /owner "robot"/.test(r.stdout), r.stdout);

r = run(['check', write('humannonotes.md', planOf([{ layer: 0, name: 'x', batches: [batch('1', { owner: 'human-review-required' })] }])), '--skills-dir', SKILLS]);
t('human-review-required without securityNotes fails', r.status === 1 && /needs securityNotes/.test(r.stdout), r.stdout);

r = run(['check', write('humanok.md', planOf([{ layer: 0, name: 'x', batches: [batch('1', { owner: 'human-review-required', securityNotes: 'JWT validation' })] }])), '--skills-dir', SKILLS]);
t('human-review-required with securityNotes passes', r.status === 0, r.stdout);

r = run(['check', write('badmodel.md', planOf([{ layer: 0, name: 'x', batches: [batch('1', { model: 'gpt' })] }])), '--skills-dir', SKILLS]);
t('bad model fails', r.status === 1 && /model "gpt"/.test(r.stdout), r.stdout);

r = run(['check', write('fullmodel.md', planOf([{ layer: 0, name: 'x', batches: [batch('1', { model: 'claude-opus-5-5' })] }])), '--skills-dir', SKILLS]);
t('full model id accepted', r.status === 0, r.stdout);

r = run(['check', write('nobrief.md', planOf([{ layer: 0, name: 'x', batches: [batch('1', { brief: 'docs/todos/f.briefs/missing.md' })] }])), '--skills-dir', SKILLS]);
t('missing brief fails', r.status === 1 && /brief file missing/.test(r.stdout), r.stdout);

r = run(['check', write('twomig.md', planOf([{ layer: 0, name: 'x', batches: [batch('1', { migrations: 1 }), batch('2', { migrations: 1 })] }])), '--skills-dir', SKILLS]);
t('two migrations in a layer warns but passes', r.status === 0 && /WARN/.test(r.stdout), r.stdout);

r = run(['check', write('twomigbatch.md', planOf([{ layer: 0, name: 'x', batches: [batch('1', { migrations: 2 })] }])), '--skills-dir', SKILLS]);
t('two migrations in one batch fails', r.status === 1 && /entity\/migrations/.test(r.stdout), r.stdout);

r = run(['check', write('samefile.md', planOf([{ layer: 0, name: 'x', batches: [batch('1', { files: { create: ['src/m1/a.ts'], modify: ['src/m1/a.ts'] } })] }])), '--skills-dir', SKILLS]);
t('same file in create and modify within one batch passes', r.status === 0, r.stdout);

// next
r = run(['next', 'good.md']);
t('next: layer 0, two runnable, suggests /implement-layer 0', /Current layer: 0/.test(r.stdout) && /batch 1/.test(r.stdout) && /batch 2/.test(r.stdout) && /implement-layer 0/.test(r.stdout), r.stdout);
let j = JSON.parse(run(['next', 'good.md', '--json']).stdout);
t('next --json runnable ids', j.layer === 0 && j.runnable.map((b) => b.id).join() === '1,2' && j.done === 0, JSON.stringify(j));

// set + round trip
r = run(['set', 'good.md', '1', 'done', '--commit', 'abc1234']);
t('set done with commit', r.status === 0 && /batch 1 -> done/.test(r.stdout), r.stdout);
t('file still has surrounding text and valid plan', /Some text/.test(readFileSync(path.join(dir, 'good.md'), 'utf8')) && run(['check', 'good.md', '--skills-dir', SKILLS]).status === 0);
j = JSON.parse(run(['next', 'good.md', '--json']).stdout);
t('after batch 1 done, batch 2 still layer 0', j.layer === 0 && j.runnable.map((b) => b.id).join() === '2', JSON.stringify(j));
run(['set', 'good.md', '2', 'in_progress']);
j = JSON.parse(run(['next', 'good.md', '--json']).stdout);
t('in progress shown, nothing runnable', j.inProgress.length === 1 && j.runnable.length === 0, JSON.stringify(j));
run(['set', 'good.md', '2', 'done']);
j = JSON.parse(run(['next', 'good.md', '--json']).stdout);
t('layer 1: both runnable', j.layer === 1 && j.runnable.map((b) => b.id).join() === '3,4', JSON.stringify(j));
run(['set', 'good.md', '3', 'failed']);
j = JSON.parse(run(['next', 'good.md', '--json']).stdout);
t('failed batch is runnable again', j.runnable.some((b) => b.id === '3'), JSON.stringify(j));
run(['set', 'good.md', '3', 'blocked']);
j = JSON.parse(run(['next', 'good.md', '--json']).stdout);
t('blocked batch listed as blocked', j.blocked.some((b) => b.id === '3') && !j.runnable.some((b) => b.id === '3'), JSON.stringify(j));
run(['set', 'good.md', '3', 'done']); run(['set', 'good.md', '4', 'done']);
r = run(['next', 'good.md']);
t('all done points to /verify-and-test', /All batches are done/.test(r.stdout) && /verify-and-test/.test(r.stdout), r.stdout);
r = run(['set', 'good.md', '9', 'done']);
t('set unknown batch fails', r.status === 1, r.stderr);
r = run(['set', 'good.md', '1', 'finished']);
t('set bad status fails', r.status === 2, r.stderr);

// waiting on dependency
write('wait.md', planOf([{ layer: 0, name: 'x', batches: [batch('1'), batch('2', { dependsOn: [] })] }, { layer: 1, name: 'y', batches: [batch('3', { dependsOn: ['1'] })] }]));
run(['set', 'wait.md', '1', 'done']); run(['set', 'wait.md', '2', 'done']);
j = JSON.parse(run(['next', 'wait.md', '--json']).stdout);
t('layer 1 batch runnable once deps done', j.layer === 1 && j.runnable.length === 1, JSON.stringify(j));

// records
mkdirSync(path.join(dir, 'docs'), { recursive: true });
writeFileSync(path.join(dir, 'docs/DECISIONS.md'), '# Decisions\n\n### D-FEAT-007-01 — Something\nbody\n');
const cl = (entries) => `# f implementation changelog\n\n## Status board\n\n| a | b |\n\n## Entries\n\n${entries}`;
writeFileSync(path.join(dir, 'cl-ok.md'), cl(`### 2026-01-02 — Batch 1\n- **Decisions:** none\n- **Deviations:** none\n\n### 2026-01-03 — Batch 2\n- **Decisions:** D-FEAT-007-01\n- **Deviations:** none\n`));
r = run(['records', 'cl-ok.md']);
t('records ok', r.status === 0 && /2 entries checked/.test(r.stdout), r.stdout);
writeFileSync(path.join(dir, 'cl-nodec.md'), cl(`### 2026-01-02 — Batch 1\n- **Deviations:** none\n`));
r = run(['records', 'cl-nodec.md']);
t('records: missing Decisions line fails', r.status === 1 && /missing a "Decisions:"/.test(r.stdout), r.stdout);
writeFileSync(path.join(dir, 'cl-unknown.md'), cl(`### 2026-01-02 — Batch 1\n- **Decisions:** D-FEAT-009-05\n- **Deviations:** none\n`));
r = run(['records', 'cl-unknown.md']);
t('records: unknown decision id fails', r.status === 1 && /not in docs\/DECISIONS.md/.test(r.stdout), r.stdout);
writeFileSync(path.join(dir, 'cl-nodev.md'), cl(`### 2026-01-02 — Batch 1\n- **Decisions:** none\n`));
r = run(['records', 'cl-nodev.md']);
t('records: missing Deviations line fails', r.status === 1 && /missing a "Deviations:"/.test(r.stdout), r.stdout);
writeFileSync(path.join(dir, 'cl-vague.md'), cl(`### 2026-01-02 — Batch 1\n- **Decisions:** we chose X\n- **Deviations:** none\n`));
r = run(['records', 'cl-vague.md']);
t('records: vague decisions line fails', r.status === 1 && /must be "none" or list decision IDs/.test(r.stdout), r.stdout);

// no block / bad json
writeFileSync(path.join(dir, 'noblock.md'), '# nothing\n');
r = run(['check', 'noblock.md']);
t('no block gives exit 2', r.status === 2, r.stderr);
writeFileSync(path.join(dir, 'badjson.md'), '```batch-plan\n{ nope\n```\n');
r = run(['check', 'badjson.md']);
t('bad json gives exit 2', r.status === 2 && /not valid JSON/.test(r.stderr), r.stderr);

// plugin installs have no project skills folder
r = run(['check', write('noskilldir.md', good)]);
t('missing default skills folder warns and passes', r.status === 0 && /skill names were not checked/.test(r.stdout), r.stdout + r.stderr);
r = run(['check', write('badskilldir.md', good), '--skills-dir', 'nope']);
t('explicit missing skills folder fails', r.status === 1 && /skills folder not found/.test(r.stdout), r.stdout);

// ---- hardening round (guardrail-change-review) ----
// the guardrail skill is mandatory for batches that touch hooks, settings, commands, agents, skills, scripts, presets or CI
mkdirSync(path.join(SKILLS, 'guardrail-change-review'), { recursive: true });
writeFileSync(path.join(SKILLS, 'guardrail-change-review', 'SKILL.md'), '---\nname: guardrail-change-review\n---\n');
const guardFiles = { create: [], modify: ['.claude/hooks/guard-bash.mjs'] };
r = run(['check', write('guard-noskill.md', planOf([{ layer: 0, name: 'x', batches: [batch('1', { files: guardFiles })] }])), '--skills-dir', SKILLS]);
t('guardrail files without guardrail-change-review fail', r.status === 1 && /guardrail-change-review/.test(r.stdout), r.stdout);
const withGuard = { planning: [], implementation: ['owasp-security', 'guardrail-change-review'], verification: [] };
r = run(['check', write('guard-skill.md', planOf([{ layer: 0, name: 'x', batches: [batch('1', { files: guardFiles, skills: withGuard })] }])), '--skills-dir', SKILLS]);
t('guardrail files with guardrail-change-review pass', r.status === 0, r.stdout);
r = run(['check', write('guard-scripts.md', planOf([{ layer: 0, name: 'x', batches: [batch('1', { files: { create: [], modify: ['scripts/claude/batch-plan.mjs'] } })] }])), '--skills-dir', SKILLS]);
t('scripts/claude also needs the guardrail skill', r.status === 1 && /guardrail-change-review/.test(r.stdout), r.stdout);

// the fields the size and parallel-safety gates read are required
r = run(['check', write('notodos.md', planOf([{ layer: 0, name: 'x', batches: [batch('1', { todos: undefined })] }])), '--skills-dir', SKILLS]);
t('missing todos fails', r.status === 1 && /"todos" must be a whole number/.test(r.stdout), r.stdout);
r = run(['check', write('nofiles.md', planOf([{ layer: 0, name: 'x', batches: [batch('1', { files: undefined })] }])), '--skills-dir', SKILLS]);
t('missing files fails', r.status === 1 && /"files" must list/.test(r.stdout), r.stdout);
r = run(['check', write('strict.md', planOf([{ layer: 0, name: 'x', batches: [batch('1', { specClauses: undefined })] }])), '--skills-dir', SKILLS, '--strict']);
t('--strict: missing specClauses is an error', r.status === 1 && /--strict requires them/.test(r.stdout), r.stdout);

// path normalisation and folder overlap
r = run(['check', write('dotslash.md', planOf([{ layer: 0, name: 'x', batches: [batch('1'), batch('2', { files: { create: ['./src/m1/a.ts'], modify: [] } })] }])), '--skills-dir', SKILLS]);
t('./a and a count as the same file', r.status === 1 && /share files/.test(r.stdout), r.stdout);
r = run(['check', write('folder.md', planOf([{ layer: 0, name: 'x', batches: [batch('1'), batch('2', { files: { create: ['src/m1/'], modify: [] } })] }])), '--skills-dir', SKILLS]);
t('a folder overlaps the files inside it', r.status === 1 && /share files/.test(r.stdout), r.stdout);
r = run(['check', write('siblings.md', planOf([{ layer: 0, name: 'x', batches: [batch('1', { files: { create: ['src/m1/a.ts'], modify: [] } }), batch('2', { files: { create: ['src/m10/a.ts'], modify: [] } })] }])), '--skills-dir', SKILLS]);
t('src/m1 and src/m10 are different', r.status === 0, r.stdout);

// input confinement
r = run(['check', write('badname.md', planOf([{ layer: 0, name: 'x', batches: [batch('1', { skills: { implementation: ['owasp-security', '../../x'] } })] }])), '--skills-dir', SKILLS]);
t('skill name with path characters fails', r.status === 1 && /not a plain name/.test(r.stdout), r.stdout);
r = run(['check', write('outsidebrief.md', planOf([{ layer: 0, name: 'x', batches: [batch('1', { brief: '../outside.md' })] }])), '--skills-dir', SKILLS]);
t('brief outside the project fails', r.status === 1 && /inside the project/.test(r.stdout), r.stdout);

// one fence only
writeFileSync(path.join(dir, 'twofence.md'), `${todo(good)}\n${todo(good)}`);
r = run(['check', 'twofence.md', '--skills-dir', SKILLS]);
t('two batch-plan fences are refused', r.status === 2 && /more than one/.test(r.stderr), r.stderr);

// set: line endings preserved, no temp or lock files left behind
writeFileSync(path.join(dir, 'crlf.md'), todo(good).replace(/\n/g, '\r\n'));
r = run(['set', 'crlf.md', '1', 'done']);
const crlf = readFileSync(path.join(dir, 'crlf.md'), 'utf8');
t('set keeps CRLF line endings', r.status === 0 && !/[^\r]\n/.test(crlf), JSON.stringify(crlf.slice(0, 80)));
const leftovers = (await import('node:fs')).readdirSync(dir).filter((n) => n.endsWith('.lock') || n.endsWith('.tmp'));
t('set leaves no lock or temp files', leftovers.length === 0, leftovers.join(','));

// set: eight processes update eight different batches of one plan at the same time; every update must survive
const many = planOf([{ layer: 0, name: 'x', batches: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((id) => batch(id, { files: { create: [`src/${id}/a.ts`], modify: [] } })) }]);
write('race.md', many);
const kids = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((id) => spawnSync(process.execPath, [SCRIPT, 'set', 'race.md', id, 'done'], { cwd: dir, encoding: 'utf8' }));
const fin = JSON.parse(run(['next', 'race.md', '--json']).stdout);
t('sequential sets all land', fin.done === 8, JSON.stringify(fin));
write('race2.md', many);
const { spawn } = await import('node:child_process');
await Promise.all(
  ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((id) => new Promise((resolve) => spawn(process.execPath, [SCRIPT, 'set', 'race2.md', id, 'done'], { cwd: dir }).on('close', resolve))),
);
const fin2 = JSON.parse(run(['next', 'race2.md', '--json']).stdout);
t('8 concurrent sets: no update is lost', fin2.done === 8, JSON.stringify(fin2));

// records: "Decisions:" inside prose does not count, ids may continue on list lines, Security line is advised
writeFileSync(path.join(dir, 'cl-prose.md'), cl(`### 2026-01-02 — Batch 1\nWe wrote Decisions: none in the prose only.\n- **Deviations:** none\n`));
r = run(['records', 'cl-prose.md']);
t('records: "Decisions:" inside a sentence does not satisfy the check', r.status === 1 && /missing a "Decisions:"/.test(r.stdout), r.stdout);
writeFileSync(path.join(dir, 'cl-list.md'), cl(`### 2026-01-02 — Batch 1\n- **Decisions:**\n  - D-FEAT-007-01\n- **Deviations:** none\n- **Security:** PASS C=0 H=0\n`));
r = run(['records', 'cl-list.md']);
t('records: decision ids on following list lines are read', r.status === 0 && !/Security:/.test(r.stdout), r.stdout);
r = run(['records', 'cl-ok.md']);
t('records: entry without a Security line warns but passes', r.status === 0 && /no "Security:" line/.test(r.stdout), r.stdout);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
