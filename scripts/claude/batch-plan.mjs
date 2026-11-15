#!/usr/bin/env node
// Deterministic helper for the layered batch plan inside a TODO file and for the implementation changelog.
//   node scripts/claude/batch-plan.mjs check   <todo.md> [--max-todos 3] [--max-files 6] [--max-migrations 1] [--no-brief-files] [--skills-dir .claude/skills] [--strict]
//        --strict: a batch without specClauses is an error (use it for every newly written plan; plans from before the field existed only warn)
//   node scripts/claude/batch-plan.mjs next    <todo.md> [--json]
//   node scripts/claude/batch-plan.mjs set     <todo.md> <batchId> <todo|in_progress|done|failed|blocked> [--commit <sha>]
//   node scripts/claude/batch-plan.mjs records <implementation-changelog.md> [--decisions docs/DECISIONS.md]
// The plan is one fenced block tagged `batch-plan` holding JSON (see .claude/commands/plan-todo.md). No dependencies.
import { closeSync, existsSync, openSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const STATUSES = ['todo', 'in_progress', 'done', 'failed', 'blocked'];
const MODELS = ['sonnet', 'opus', 'haiku', 'fable', 'inherit'];
const OWNERS = ['AI', 'human-review-required'];
const BLOCK = /```batch-plan[ \t]*\r?\n([\s\S]*?)\r?\n```/;
// A batch that touches the guardrails (hooks, settings, commands, agents, skills, scripts, presets, CI) must load this skill.
const GUARDRAIL_PATHS = /^(?:\.claude\/|scripts\/claude\/|\.github\/|presets\/)/;
const GUARDRAIL_SKILL = 'guardrail-change-review';

const [cmd, file, ...rest] = process.argv.slice(2);
const flags = {};
const positional = [];
for (let i = 0; i < rest.length; i++) {
  if (rest[i].startsWith('--')) {
    const key = rest[i].slice(2);
    const val = rest[i + 1] && !rest[i + 1].startsWith('--') ? rest[++i] : true;
    flags[key] = val;
  } else positional.push(rest[i]);
}

// Windows reports a file that another process has open (or is replacing) as EPERM/EACCES/EBUSY, not as a normal error:
// all of them mean "try again in a moment".
const BUSY = ['EEXIST', 'EPERM', 'EACCES', 'EBUSY'];
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
function retryFs(fn, tries = 60) {
  for (let i = 0; ; i++) {
    try {
      return fn();
    } catch (e) {
      if (!BUSY.includes(e.code) || i >= tries) throw e;
      sleep(10 + Math.floor(Math.random() * 40));
    }
  }
}
let onExit = null; // releases the plan lock: process.exit() skips `finally`, so every exit path runs this first
function die(msg, code = 1) {
  onExit?.();
  console.error(msg);
  process.exit(code);
}
if (!cmd || !file) die('usage: batch-plan.mjs <check|next|set|records> <file> [...]', 2);
if (!existsSync(file)) die(`file not found: ${file}`, 2);
const text = retryFs(() => readFileSync(file, 'utf8'));

function loadPlan(src = text) {
  const m = BLOCK.exec(src);
  if (!m) die('no ```batch-plan block found in the file', 2);
  // A second fence (for example an example block quoted earlier or later) would make "the first one wins" a silent mis-edit.
  if ((src.match(new RegExp(BLOCK.source, 'g')) ?? []).length > 1) die('more than one ```batch-plan block in the file; keep exactly one', 2);
  try {
    return { plan: JSON.parse(m[1]), match: m };
  } catch (e) {
    die(`batch-plan block is not valid JSON: ${e.message}`, 2);
  }
}
const batchesOf = (plan) => (plan.layers ?? []).flatMap((l) => (l.batches ?? []).map((b) => ({ ...b, layer: l.layer })));
// Normalise so `./a`, `a`, `a\b` and `a/b` compare equal; a trailing slash marks a folder.
const normFile = (f) => {
  const n = path.posix.normalize(String(f).replace(/\\/g, '/')).replace(/^\.\//, '');
  return /\/$/.test(String(f).replace(/\\/g, '/')) && !n.endsWith('/') ? `${n}/` : n;
};
const filesOf = (b) => [...new Set([...(b.files?.create ?? []), ...(b.files?.modify ?? [])].map(normFile))];
// Two entries overlap when equal, or when one is a folder that contains the other.
const overlaps = (x, y) => x === y || (x.endsWith('/') && y.startsWith(x)) || (y.endsWith('/') && x.startsWith(y));
const SAFE_NAME = /^[\w-]+$/;
const insideCwd = (p) => {
  const rel = path.relative(process.cwd(), path.resolve(p));
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
};

if (cmd === 'check') {
  const { plan } = loadPlan();
  const maxTodos = Number(flags['max-todos'] ?? 3);
  const maxFiles = Number(flags['max-files'] ?? 6);
  const maxMig = Number(flags['max-migrations'] ?? 1);
  const skillsDir = String(flags['skills-dir'] ?? '.claude/skills');
  const errors = [];
  const warns = [];
  // A plugin install keeps skills inside the plugin, so the project has no skills folder: skip the name check with a warning.
  const checkSkills = existsSync(skillsDir);
  if (!checkSkills) {
    if (flags['skills-dir'] !== undefined) errors.push(`skills folder not found: ${skillsDir}`);
    else warns.push(`no ${skillsDir} folder: skill names were not checked (a plugin install keeps skills in the plugin; pass --skills-dir to check them)`);
  }
  const all = batchesOf(plan);
  if (all.length === 0) errors.push('plan has no batches');

  const layerNums = (plan.layers ?? []).map((l) => l.layer);
  if (new Set(layerNums).size !== layerNums.length) errors.push('duplicate layer numbers');
  if (layerNums.some((n, i) => i > 0 && n <= layerNums[i - 1])) errors.push('layers must be listed in ascending order');

  const byId = new Map();
  for (const b of all) {
    if (byId.has(String(b.id))) errors.push(`duplicate batch id ${b.id}`);
    byId.set(String(b.id), b);
  }

  for (const b of all) {
    const tag = `batch ${b.id} (layer ${b.layer})`;
    for (const dep of b.dependsOn ?? []) {
      const d = byId.get(String(dep));
      if (!d) errors.push(`${tag}: depends on unknown batch ${dep}`);
      else if (d.layer >= b.layer) errors.push(`${tag}: depends on batch ${dep} in layer ${d.layer}; a dependency must be in a lower layer`);
    }
    // The size and parallel-safety gates only mean something if the fields they read are present.
    if (!Number.isInteger(b.todos) || b.todos < 0) errors.push(`${tag}: "todos" must be a whole number (the count of TODOs in the batch)`);
    else if (b.todos > maxTodos) errors.push(`${tag}: ${b.todos} TODOs (max ${maxTodos})`);
    if (!b.files || typeof b.files !== 'object' || (!Array.isArray(b.files.create) && !Array.isArray(b.files.modify))) errors.push(`${tag}: "files" must list create and/or modify paths (the parallel-safety check reads it)`);
    if (filesOf(b).length > maxFiles) errors.push(`${tag}: ${filesOf(b).length} files (max ${maxFiles})`);
    if (b.migrations !== undefined && (!Number.isInteger(b.migrations) || b.migrations < 0)) errors.push(`${tag}: "migrations" must be a whole number`);
    if ((b.migrations ?? 0) > maxMig) errors.push(`${tag}: ${b.migrations} entity/migrations (max ${maxMig})`);
    if (!MODELS.includes(b.model) && !/^claude-[\w.-]+$/.test(String(b.model ?? ''))) errors.push(`${tag}: model "${b.model}" is not one of ${MODELS.join(', ')} or a full model id`);
    if (!STATUSES.includes(b.status)) errors.push(`${tag}: status "${b.status}" is not one of ${STATUSES.join(', ')}`);
    const impl = b.skills?.implementation;
    if (!Array.isArray(impl) || impl.length === 0) errors.push(`${tag}: skills.implementation must list at least one skill`);
    else if (!impl.includes('owasp-security')) errors.push(`${tag}: skills.implementation must include owasp-security (the security floor applies to every batch)`);
    // A batch that edits hooks, settings, commands, agents, skills, scripts, presets or CI must load the guardrail regression gate.
    if (Array.isArray(impl) && filesOf(b).some((f) => GUARDRAIL_PATHS.test(f)) && !impl.includes(GUARDRAIL_SKILL)) {
      errors.push(`${tag}: touches ${filesOf(b).find((f) => GUARDRAIL_PATHS.test(f))} (guardrail area): skills.implementation must include ${GUARDRAIL_SKILL}`);
    }
    // Traceability and ownership. Plans written before these fields existed only get a warning (an error with --strict).
    if (b.specClauses === undefined) {
      if (flags.strict) errors.push(`${tag}: no specClauses (which spec sections this batch implements); --strict requires them`);
      else if (b.status !== 'done') warns.push(`${tag}: no specClauses (which spec sections this batch implements)`);
    }
    else if (!Array.isArray(b.specClauses) || b.specClauses.length === 0 || b.specClauses.some((c) => !String(c).trim())) errors.push(`${tag}: specClauses must list at least one non-empty spec clause`);
    if (b.owner !== undefined && !OWNERS.includes(b.owner)) errors.push(`${tag}: owner "${b.owner}" is not one of ${OWNERS.join(', ')}`);
    if (b.owner === 'human-review-required' && !String(b.securityNotes ?? '').trim()) errors.push(`${tag}: owner human-review-required needs securityNotes saying what is sensitive (auth, secrets, PII, migration, CI)`);
    for (const phase of ['planning', 'implementation', 'verification']) {
      for (const s of b.skills?.[phase] ?? []) {
        if (!SAFE_NAME.test(String(s))) errors.push(`${tag}: skill name "${s}" (${phase}) is not a plain name (letters, digits, - and _ only)`);
        else if (checkSkills && !existsSync(path.join(skillsDir, s, 'SKILL.md'))) errors.push(`${tag}: skill "${s}" (${phase}) not found in ${skillsDir}`);
      }
    }
    if (!flags['no-brief-files'] && b.status !== 'done') {
      if (!b.brief) errors.push(`${tag}: no brief path`);
      else if (!insideCwd(b.brief)) errors.push(`${tag}: brief path must be inside the project: ${b.brief}`);
      else if (!existsSync(b.brief)) errors.push(`${tag}: brief file missing: ${b.brief}`);
    }
  }

  for (const l of plan.layers ?? []) {
    const seen = []; // [{ file, id }] of every earlier batch in this layer
    for (const b of l.batches ?? []) {
      for (const f of filesOf(b)) {
        const hit = seen.find((s) => s.id !== b.id && overlaps(s.file, f));
        if (hit) errors.push(`layer ${l.layer}: ${f} overlaps ${hit.file} (batch ${hit.id}) and batch ${b.id}; same-layer batches must not share files (a folder counts as all of its files)`);
      }
      for (const f of filesOf(b)) seen.push({ file: f, id: b.id });
    }
    const migBatches = (l.batches ?? []).filter((b) => (b.migrations ?? 0) > 0).map((b) => b.id);
    if (migBatches.length > 1) warns.push(`layer ${l.layer}: batches ${migBatches.join(', ')} each add a migration; give them timestamps in batch-id order`);
  }

  for (const w of warns) console.log(`WARN  ${w}`);
  for (const e of errors) console.log(`ERROR ${e}`);
  console.log(errors.length ? `\n${errors.length} error(s), ${warns.length} warning(s)` : `OK: ${all.length} batches in ${layerNums.length} layer(s), ${warns.length} warning(s)`);
  process.exit(errors.length ? 1 : 0);
}

if (cmd === 'next') {
  const { plan } = loadPlan();
  const all = batchesOf(plan);
  const byId = new Map(all.map((b) => [String(b.id), b]));
  const open = all.filter((b) => b.status !== 'done');
  const result = { feature: plan.feature ?? null, updated: plan.updated ?? null, layer: null, runnable: [], waiting: [], inProgress: [], blocked: [], done: all.length - open.length, total: all.length };
  if (open.length) {
    result.layer = Math.min(...open.map((b) => b.layer));
    for (const b of open.filter((x) => x.layer === result.layer)) {
      const pending = (b.dependsOn ?? []).filter((d) => byId.get(String(d))?.status !== 'done');
      const row = { id: String(b.id), goal: b.goal ?? '', model: b.model, skills: b.skills?.implementation ?? [], brief: b.brief ?? null, status: b.status, waitingOn: pending };
      if (b.status === 'in_progress') result.inProgress.push(row);
      else if (b.status === 'blocked') result.blocked.push(row);
      else if (pending.length) result.waiting.push(row);
      else result.runnable.push(row);
    }
  }
  if (flags.json) {
    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
  }
  console.log(`Feature: ${result.feature ?? '(unnamed)'}   updated: ${result.updated ?? '?'}   done: ${result.done}/${result.total}`);
  if (!open.length) {
    console.log('All batches are done. Next: /verify-and-test');
    process.exit(0);
  }
  const layerName = (plan.layers ?? []).find((l) => l.layer === result.layer)?.name ?? '';
  console.log(`Current layer: ${result.layer}${layerName ? ` "${layerName}"` : ''}`);
  const show = (title, rows, extra = () => '') => {
    if (!rows.length) return;
    console.log(`\n${title}`);
    for (const r of rows) console.log(`  - batch ${r.id} [${r.model}] ${r.goal}${extra(r)}\n      skills: ${r.skills.join(', ') || '-'}   brief: ${r.brief ?? '-'}`);
  };
  show('Runnable now, in parallel:', result.runnable);
  show('In progress:', result.inProgress);
  show('Blocked:', result.blocked);
  show('Waiting on dependencies:', result.waiting, (r) => `  (needs ${r.waitingOn.join(', ')})`);
  if (result.runnable.length > 1) console.log(`\nNext: /implement-layer ${result.layer}   (runs the ${result.runnable.length} runnable batches in parallel)`);
  else if (result.runnable.length === 1) console.log(`\nNext: /implement-batch ${result.runnable[0].id}`);
  else console.log('\nNothing is runnable: finish the in-progress batches or unblock the blocked ones.');
  process.exit(0);
}

if (cmd === 'set') {
  const [id, status] = positional;
  if (!id || !STATUSES.includes(status)) die(`usage: set <todo.md> <batchId> <${STATUSES.join('|')}> [--commit <sha>]`, 2);
  // Read-modify-write under a lock, re-reading the file after the lock is taken, so two sessions or two parallel batches
  // cannot overwrite each other's status; write to a temp file and rename so a crash cannot leave a truncated TODO.
  const lock = `${file}.lock`;
  let fd = -1;
  for (let i = 0; i < 200 && fd === -1; i++) {
    try {
      fd = openSync(lock, 'wx');
    } catch (e) {
      if (!BUSY.includes(e.code)) throw e;
      try {
        if (Date.now() - statSync(lock).mtimeMs > 30000) unlinkSync(lock); // a crashed run left it behind
      } catch {
        /* another process removed it: retry */
      }
      sleep(25 + Math.floor(Math.random() * 50));
    }
  }
  if (fd === -1) die(`could not lock ${file} (is another process updating it? remove ${lock} if not)`, 1);
  const release = () => {
    onExit = null;
    try {
      closeSync(fd);
    } catch {
      /* already closed */
    }
    try {
      unlinkSync(lock);
    } catch {
      /* already gone */
    }
  };
  onExit = release;
  try {
    const fresh = retryFs(() => readFileSync(file, 'utf8'));
    const eol = fresh.includes('\r\n') ? '\r\n' : '\n';
    const { plan } = loadPlan(fresh);
    const target = (plan.layers ?? []).flatMap((l) => l.batches ?? []).find((b) => String(b.id) === String(id));
    if (!target) die(`batch ${id} not found`, 1);
    if (status === 'in_progress' && target.status === 'in_progress') {
      console.log(`WARN  batch ${id} is already in_progress — someone else may be working on it. Proceeding will not tell you who.`);
    }
    if (target.status === 'done' && status !== 'done') console.log(`WARN  batch ${id} was done; re-opening it as ${status}.`);
    target.status = status;
    if (flags.commit && flags.commit !== true) target.commit = String(flags.commit);
    plan.updated = new Date().toISOString().slice(0, 10);
    const block = '```batch-plan\n' + JSON.stringify(plan, null, 2) + '\n```';
    const next = fresh.replace(BLOCK, () => (eol === '\r\n' ? block.replace(/\n/g, '\r\n') : block));
    const tmp = `${file}.${process.pid}.tmp`;
    writeFileSync(tmp, next);
    retryFs(() => renameSync(tmp, file));
    console.log(`batch ${id} -> ${status}${target.commit ? ` (commit ${target.commit})` : ''}; plan updated ${plan.updated}`);
  } finally {
    release();
  }
  process.exit(0);
}

if (cmd === 'records') {
  const decisionsPath = String(flags.decisions ?? 'docs/DECISIONS.md');
  const known = new Set();
  if (existsSync(decisionsPath)) {
    for (const m of readFileSync(decisionsPath, 'utf8').matchAll(/\bD-[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*-\d{2,}\b/g)) known.add(m[0]);
  }
  const entriesAt = text.search(/^##\s+Entries\b/im);
  const body = entriesAt === -1 ? '' : text.slice(entriesAt);
  const entries = body.split(/^###\s+/m).slice(1);
  const errors = [];
  const warns = [];
  if (entriesAt === -1) errors.push('no "## Entries" section');
  entries.forEach((e, i) => {
    const title = e.split('\n')[0].trim();
    // "Decisions:" must start a line (optionally a list item or bold), so the word inside prose does not satisfy the check;
    // ids may continue on the next list lines.
    const lines = e.split(/\r?\n/);
    const at = lines.findIndex((l) => /^\s*(?:[-*]\s*)?\**Decisions:\**\s*\S/i.test(l));
    const dec = at === -1 ? null : [null, [lines[at].replace(/^\s*(?:[-*]\s*)?\**Decisions:\**\s*/i, ''), ...lines.slice(at + 1).filter((l, k) => k < 6 && /^\s+(?:[-*]\s+)?\S/.test(l) && !/^\s*(?:[-*]\s*)?\**[A-Z][A-Za-z ]+:\**/.test(l))].join(' ')];
    if (!/^\s*(?:[-*]\s*)?\**Security:\**\s*\S/im.test(e)) warns.push(`entry "${title}": no "Security:" line (record the security-reviewer verdict, or "n/a: no code change")`);
    if (!dec) {
      errors.push(`entry "${title}": missing a "Decisions:" line (write "none" if there were none)`);
      return;
    }
    if (!/^none\b/i.test(dec[1].trim())) {
      const ids = dec[1].match(/\bD-[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*-\d{2,}\b/g) ?? [];
      if (ids.length === 0) errors.push(`entry "${title}": "Decisions:" must be "none" or list decision IDs`);
      for (const id of ids) if (!known.has(id)) errors.push(`entry "${title}": decision ${id} is not in ${decisionsPath}`);
    }
    if (!/Deviations:\**\s*\S/i.test(e)) errors.push(`entry "${title}": missing a "Deviations:" line (write "none" if there were none)`);
  });
  for (const w of warns) console.log(`WARN  ${w}`);
  for (const e of errors) console.log(`ERROR ${e}`);
  console.log(errors.length ? `\n${errors.length} problem(s) in ${entries.length} entr${entries.length === 1 ? 'y' : 'ies'}` : `OK: ${entries.length} entr${entries.length === 1 ? 'y' : 'ies'} checked`);
  process.exit(errors.length ? 1 : 0);
}

die(`unknown command: ${cmd}`, 2);
