// Validate the vendored Claude Code workflow: frontmatter, profile preamble, link and template references, name clashes,
// and drift from the pristine upstream hashes. Usage: node scripts/claude/validate-workflow.mjs [project-root]
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { inspect as inspectAgentTools, loadPolicy as loadAgentToolPolicy } from './agent-tools.mjs';

const root = path.resolve(process.argv[2] ?? process.cwd());
// Two layouts: a project (files under .claude/) or the plugin itself (commands/, agents/, skills/ at the root).
const isPlugin = existsSync(path.join(root, '.claude-plugin', 'plugin.json'));
const claude = isPlugin ? root : path.join(root, '.claude');
const errors = [];
const warnings = [];
const err = (m) => errors.push(m);
const warn = (m) => warnings.push(m);

// A link to a sibling skill that is not installed (a stack skill for another stack) is a warning, not an error.
function brokenRef(file, ref, target) {
  const sib = ref.match(/^\.\.\/([\w-]+)\//);
  if (sib && !existsSync(path.join(claude, 'skills', sib[1]))) warn(`${rel(file)}: links to skill "${sib[1]}", which is not installed (add it, or ignore if your stack does not use it)`);
  else err(`${rel(file)}: broken reference ${ref}`);
}

const rel = (p) => path.relative(root, p).split(path.sep).join('/');
const listMd = (dir) => (existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.md')).map((f) => path.join(dir, f)) : []);

function frontmatter(file) {
  const s = readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  const m = s.match(/^---\n([\s\S]*?)\n---\n/);
  if (!m) return { text: s, fm: null };
  const fm = {};
  for (const line of m[1].split('\n')) {
    const k = line.match(/^([A-Za-z-]+):\s*(.*)$/);
    if (k) fm[k[1]] = k[2];
  }
  return { text: s, fm, raw: m[1] };
}

const items = [
  ...listMd(path.join(claude, 'commands')).map((f) => ({ f, kind: 'command', name: path.basename(f, '.md') })),
  ...listMd(path.join(claude, 'agents')).map((f) => ({ f, kind: 'agent', name: path.basename(f, '.md') })),
  ...(existsSync(path.join(claude, 'skills'))
    ? readdirSync(path.join(claude, 'skills'))
        .filter((d) => existsSync(path.join(claude, 'skills', d, 'SKILL.md')))
        .map((d) => ({ f: path.join(claude, 'skills', d, 'SKILL.md'), kind: 'skill', name: d }))
    : []),
];

const names = new Map();
const descChars = { command: 0, agent: 0, skill: 0 };
const needsPreamble = isPlugin || existsSync(path.join(claude, 'spec-driven', 'upstream.sha256'));

for (const it of items) {
  const { text, fm, raw } = frontmatter(it.f);
  if (!fm) {
    err(`${rel(it.f)}: no frontmatter`);
    continue;
  }
  // YAML: a plain (unquoted) value that contains ": " or " #" is not valid. The whole frontmatter then fails to parse and
  // Claude Code falls back to the first line of the body as the description, so the command or skill is mis-described.
  for (const line of (raw ?? '').split('\n')) {
    const m = line.match(/^([A-Za-z_-]+):\s+(\S.*)$/);
    if (!m) continue;
    const v = m[2].trim();
    if (/^["'>|\[{]/.test(v)) continue; // quoted, block scalar, flow collection
    if (/:\s/.test(v) || /\s#/.test(v) || /:$/.test(v)) err(`${rel(it.f)}: frontmatter "${m[1]}" has ": " or " #" inside an unquoted value (invalid YAML: quote the value)`);
  }
  if (!fm.description && !/description:\s*[>|]/.test(raw ?? '')) err(`${rel(it.f)}: missing description`);
  if ((it.kind === 'agent' || it.kind === 'skill') && fm.name && fm.name !== it.name) err(`${rel(it.f)}: name "${fm.name}" does not match "${it.name}"`);
  if (it.kind !== 'command' && !fm.name) err(`${rel(it.f)}: missing name`);
  descChars[it.kind] += (raw ?? '').length;
  const key = `${it.kind === 'agent' ? 'agent' : 'slash'}:${it.name}`;
  if (names.has(key)) err(`${rel(it.f)}: duplicate ${it.kind} name "${it.name}" (also ${names.get(key)})`);
  names.set(key, rel(it.f));
  if (needsPreamble && (isPlugin || it.f.includes(`${path.sep}.claude${path.sep}`)) && !text.includes('**Profile preamble**') && it.kind !== 'agent-local') {
    warn(`${rel(it.f)}: no profile preamble (fine for project-authored files)`);
  }
}

// references: markdown links and backticked relative paths inside skills, plus template refs everywhere
const refRe = [/\]\((\.{1,2}\/[^)#\s]+)/g, /`(\.\.?\/[^`\s]+\.(?:md|template))`/g];
for (const it of items) {
  const dir = path.dirname(it.f);
  const text = readFileSync(it.f, 'utf8');
  for (const re of refRe) {
    for (const m of text.matchAll(re)) {
      const target = path.resolve(dir, m[1]);
      if (!existsSync(target)) brokenRef(it.f, m[1], target);
    }
  }
  const templateRef = isPlugin ? /(?<![./\w])templates\/([\w.-]+\.template)/g : /\.claude\/templates\/([\w.-]+)/g;
  for (const m of text.matchAll(templateRef)) {
    if (!existsSync(path.join(claude, 'templates', m[1]))) err(`${rel(it.f)}: missing template ${m[1]}`);
  }
  if (isPlugin && text.includes('.claude/templates/')) err(`${rel(it.f)}: project path .claude/templates/ in a plugin file (use templates/)`);
  if (!isPlugin && it.kind !== 'skill' && /(^|[^./\w])templates\/[\w.-]+\.template/.test(text.replaceAll('.claude/templates/', ''))) {
    err(`${rel(it.f)}: bare templates/ path (should be .claude/templates/)`);
  }
}
// sub-files of skills
const subFiles = (dir) =>
  readdirSync(dir).flatMap((n) => {
    const p = path.join(dir, n);
    return statSync(p).isDirectory() ? subFiles(p) : p.endsWith('.md') && n !== 'SKILL.md' ? [p] : [];
  });
if (existsSync(path.join(claude, 'skills'))) {
  for (const f of subFiles(path.join(claude, 'skills'))) {
    const text = readFileSync(f, 'utf8');
    for (const re of refRe) for (const m of text.matchAll(re)) if (!existsSync(path.resolve(path.dirname(f), m[1]))) brokenRef(f, m[1]);
  }
}

// ---- wiring and safety checks (project layout only). Errors are objective breakage; warnings are lint. ----
if (!isPlugin) {
  const walk = (dir) =>
    existsSync(dir)
      ? readdirSync(dir).flatMap((n) => {
          const p = path.join(dir, n);
          return statSync(p).isDirectory() ? walk(p) : p.endsWith('.md') ? [p] : [];
        })
      : [];

  // 1. every hook script named in settings.json exists, and the matchers cover every write tool and both shells
  const settingsFile = path.join(claude, 'settings.json');
  if (existsSync(settingsFile)) {
    let settings = null;
    try {
      settings = JSON.parse(readFileSync(settingsFile, 'utf8'));
    } catch (e) {
      err(`${rel(settingsFile)}: invalid JSON (${e.message})`);
    }
    for (const [event, groups] of Object.entries(settings?.hooks ?? {})) {
      for (const g of groups ?? []) {
        for (const h of g.hooks ?? []) {
          const cmd = [h.command, ...(h.args ?? [])].join(' ');
          for (const m of cmd.matchAll(/\$\{CLAUDE_PROJECT_DIR\}\/(\S+?\.(?:mjs|js|sh|ps1))/g)) {
            if (!existsSync(path.join(root, m[1]))) err(`${rel(settingsFile)}: ${event} hook script missing: ${m[1]}`);
          }
          const isEditGuard = /guard-edits|owasp-guard|post-edit/.test(cmd);
          if (isEditGuard && g.matcher && !/NotebookEdit/.test(g.matcher)) warn(`${rel(settingsFile)}: ${event} matcher "${g.matcher}" misses NotebookEdit (an edit made with that tool skips ${cmd.match(/[\w-]+\.mjs/)?.[0]})`);
          if (isEditGuard && g.matcher && !/MultiEdit/.test(g.matcher) && event === 'PreToolUse') warn(`${rel(settingsFile)}: ${event} matcher "${g.matcher}" misses MultiEdit`);
          if (/guard-bash/.test(cmd) && g.matcher && !/PowerShell/.test(g.matcher)) warn(`${rel(settingsFile)}: ${event} matcher "${g.matcher}" misses PowerShell (commands run there skip the command guard)`);
        }
      }
    }
    if (settings && settings.permissions?.disableBypassPermissionsMode !== 'disable') warn(`${rel(settingsFile)}: permissions.disableBypassPermissionsMode is not "disable" (anyone can start with permission prompts off)`);
    for (const must of ['Read(**/.env)', 'Bash(git push --force*)', 'Bash(git reset --hard*)']) {
      if (settings && !(settings.permissions?.deny ?? []).includes(must)) warn(`${rel(settingsFile)}: deny list has no "${must}"`);
    }
  }

  // 2. CLAUDE.md stays short (its own limit)
  const claudeMd = path.join(root, 'CLAUDE.md');
  if (existsSync(claudeMd)) {
    const n = readFileSync(claudeMd, 'utf8').split('\n').length;
    if (n > 200) err(`CLAUDE.md is ${n} lines (limit 200): move detail into .claude/rules/ or a skill`);
  }

  // 3. documented scripts, flags and subcommands exist (a command must not tell Claude to run something that is not there)
  const SUBCOMMANDS = new Set(['check', 'next', 'set', 'records']);
  for (const f of [...walk(claude), ...(existsSync(claudeMd) ? [claudeMd] : [])]) {
    const t = readFileSync(f, 'utf8');
    for (const m of t.matchAll(/scripts\/claude\/([\w.-]+\.mjs)/g)) {
      if (!existsSync(path.join(root, 'scripts', 'claude', m[1]))) err(`${rel(f)}: refers to scripts/claude/${m[1]}, which does not exist`);
    }
    for (const m of t.matchAll(/batch-plan\.mjs\s+([a-z]+)\b/g)) {
      if (!SUBCOMMANDS.has(m[1])) err(`${rel(f)}: "batch-plan.mjs ${m[1]}" is not a subcommand (check, next, set, records)`);
    }
  }

  // 4. frontmatter keys and values
  const COMMAND_KEYS = new Set(['name', 'description', 'when_to_use', 'argument-hint', 'arguments', 'disable-model-invocation', 'user-invocable', 'allowed-tools', 'disallowed-tools', 'model', 'effort', 'context', 'agent', 'background', 'hooks', 'paths', 'shell', 'metadata', 'license', 'compatibility']);
  const AGENT_KEYS = new Set(['name', 'description', 'tools', 'disallowedTools', 'model', 'permissionMode', 'maxTurns', 'autoCompactWindow', 'skills', 'mcpServers', 'hooks', 'memory', 'background', 'effort', 'isolation', 'color', 'initialPrompt', 'omitClaudeMd', 'experimental']);
  const MODEL_OK = /^(?:haiku|sonnet|opus|fable|inherit|claude-[\w.-]+)$/;
  for (const it of items) {
    const { fm, raw } = frontmatter(it.f);
    if (!fm) continue;
    const known = it.kind === 'agent' ? AGENT_KEYS : COMMAND_KEYS;
    for (const k of Object.keys(fm)) if (!known.has(k)) warn(`${rel(it.f)}: frontmatter key "${k}" is not a documented ${it.kind} field (it is ignored)`);
    if (fm.model && !MODEL_OK.test(fm.model.trim())) err(`${rel(it.f)}: model "${fm.model}" is not haiku, sonnet, opus, fable, inherit or a full model id`);
    if (it.kind === 'agent') {
      if (/(^|[\s,\[])Skill([\s,\]]|$)/.test(fm.tools ?? '')) warn(`${rel(it.f)}: "Skill" in tools disables skill loading for this agent (use the skills field to preload instead)`);
      if (!fm.tools && !fm.disallowedTools) warn(`${rel(it.f)}: no tools or disallowedTools: the agent inherits every tool, including tracker and chat writes`);
      // "Read-only for source; its only write is X" is honest; a bare "read-only" with a write tool is not.
      if (/read-only/i.test(fm.description ?? '') && !/only writes?\b|writes? only|only write\b/i.test(fm.description ?? '') && /\b(Write|Edit|NotebookEdit)\b/.test(fm.tools ?? '')) warn(`${rel(it.f)}: described as read-only but its tools include a write tool`);
      if (!/untrusted data/i.test(readFileSync(it.f, 'utf8'))) warn(`${rel(it.f)}: no untrusted-data rule (ticket, PR, diff and spec text must be treated as data)`);
    }
    if (it.kind === 'command' && fm['allowed-tools'] && /read-only|changes no file/i.test(readFileSync(it.f, 'utf8'))) {
      warn(`${rel(it.f)}: allowed-tools only pre-approves tools; to restrict a read-only command use disallowed-tools`);
    }
  }

  // 4b. agents without a tools allowlist carry exactly the deny list in scripts/claude/agent-tool-policy.json
  let toolPolicy = null;
  try {
    toolPolicy = loadAgentToolPolicy(root);
  } catch (e) {
    err(e.message);
  }
  if (toolPolicy) {
    for (const r of inspectAgentTools(root, toolPolicy)) {
      if (r.problem) err(`${r.path}: ${r.problem}`);
      else if (!r.hasLine || r.missing.length || r.extra.length) err(`${r.path}: disallowedTools is out of step with scripts/claude/agent-tool-policy.json (run: node scripts/claude/agent-tools.mjs apply)`);
    }
  }

  // 5. the regression gate exists: the skill, the bypass table, and the reviewer that must run it
  if (!existsSync(path.join(claude, 'skills', 'guardrail-change-review', 'SKILL.md'))) err('missing skill guardrail-change-review (the regression gate for hook, settings, workflow and script changes)');
  if (existsSync(path.join(claude, 'hooks')) && !existsSync(path.join(root, 'scripts', 'claude', 'tests', 'hooks.test.mjs'))) err('missing scripts/claude/tests/hooks.test.mjs (the bypass regression table for the hooks)');
  const reviewer = path.join(claude, 'agents', 'security-reviewer.md');
  if (existsSync(reviewer) && !/guardrail-change-review/.test(readFileSync(reviewer, 'utf8'))) warn('security-reviewer does not mention guardrail-change-review (diffs that touch hooks or settings need it)');
}

// drift from upstream
const manifest = path.join(claude, 'spec-driven', 'upstream.sha256');
let changed = 0;
let missing = 0;
if (existsSync(manifest)) {
  for (const line of readFileSync(manifest, 'utf8').split('\n').filter(Boolean)) {
    const [hash, ...p] = line.split(/\s+/);
    const file = path.join(root, p.join(' '));
    if (!existsSync(file)) {
      missing++;
      warn(`upstream file no longer present: ${p.join(' ')}`);
    } else if (createHash('sha256').update(readFileSync(file)).digest('hex') !== hash) changed++;
  }
}

console.log(`workflow: ${items.filter((i) => i.kind === 'command').length} commands, ${items.filter((i) => i.kind === 'skill').length} skills, ${items.filter((i) => i.kind === 'agent').length} agents`);
console.log(`frontmatter size (chars): commands ${descChars.command}, skills ${descChars.skill}, agents ${descChars.agent}`);
if (existsSync(manifest)) console.log(`vs upstream: ${changed} file(s) modified, ${missing} missing (see .claude/spec-driven/CHANGES.md)`);
for (const w of warnings) console.log(`WARN  ${w}`);
for (const e of errors) console.log(`ERROR ${e}`);
console.log(errors.length ? `\nFAILED: ${errors.length} error(s)` : '\nOK');
process.exit(errors.length ? 1 : 0);
