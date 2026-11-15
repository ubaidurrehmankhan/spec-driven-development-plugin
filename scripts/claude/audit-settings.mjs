// Audit Claude Code settings files for secrets stored in permission rules. Prints counts and rule positions only, never values.
// Usage: node audit-settings.mjs <settings.json> [more files...]
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const PATTERNS = [
  ['JWT', /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/],
  ['bearer token', /Bearer\s+(?!\$|\{|<)[A-Za-z0-9._~+/-]{30,}/],
  ['password', /(password|passwd|pwd)["']?\s*[:=]\s*["']?(?!\$|\{|<)[^\s"',}]{4,}/i],
  ['AWS key', /\bAKIA[0-9A-Z]{16}\b/],
  ['api key/secret', /(api[_-]?key|secret|token)["']?\s*[:=]\s*["']?(?!\$|\{|<)[A-Za-z0-9._~+/-]{16,}/i],
];

let exitCode = 0;
for (const file of process.argv.slice(2)) {
  if (!existsSync(file)) {
    console.log(`${file}: not found`);
    continue;
  }
  let json;
  try {
    json = JSON.parse(readFileSync(file, 'utf8'));
  } catch (e) {
    console.log(`${file}: invalid JSON (${e.message})`);
    continue;
  }
  const perms = json.permissions ?? {};
  const report = { file, rules: {}, flagged: {} };
  for (const list of ['allow', 'ask', 'deny']) {
    const rules = Array.isArray(perms[list]) ? perms[list] : [];
    report.rules[list] = rules.length;
    rules.forEach((rule, i) => {
      for (const [label, re] of PATTERNS) {
        if (re.test(String(rule))) (report.flagged[label] ??= []).push(`${list}[${i}]`);
      }
    });
  }
  const total = Object.values(report.flagged).reduce((n, a) => n + a.length, 0);
  if (total) exitCode = 1;
  console.log(`${file}\n  rules: allow=${report.rules.allow} ask=${report.rules.ask} deny=${report.rules.deny}`);
  if (!total) console.log('  secret-like rules: none');
  for (const [label, where] of Object.entries(report.flagged)) {
    console.log(`  ${label}: ${where.length} rule(s) at ${where.slice(0, 8).join(', ')}${where.length > 8 ? ', ...' : ''}`);
  }
  const hooks = json.hooks ? Object.keys(json.hooks) : [];
  console.log(`  hooks: ${hooks.length ? hooks.join(', ') : 'none'}`);

  // Permission drift: the guarantees the project documents must still be in the file.
  const problems = [];
  const deny = Array.isArray(perms.deny) ? perms.deny.map(String) : [];
  for (const must of ['Read(**/.env)', 'Bash(git push --force*)', 'Bash(git reset --hard*)', 'Bash(git commit --amend*)', 'Bash(npm publish*)']) {
    if (!deny.includes(must)) problems.push(`deny list lacks "${must}"`);
  }
  for (const rule of Array.isArray(perms.allow) ? perms.allow.map(String) : []) {
    if (/^(?:\*|Bash|PowerShell|Bash\(\*\)|PowerShell\(\*\)|Bash\(\* \*\)|Edit|Write|Read)$/.test(rule.trim())) problems.push(`allow rule "${rule}" approves a whole tool with no scope`);
  }
  // Hook script paths: ${CLAUDE_PROJECT_DIR}/... resolved from the project that holds .claude/settings.json
  const projectRoot = path.resolve(path.dirname(file), '..');
  for (const [event, groups] of Object.entries(json.hooks ?? {})) {
    for (const g of groups ?? []) {
      for (const h of g.hooks ?? []) {
        for (const m of [h.command, ...(h.args ?? [])].join(' ').matchAll(/\$\{CLAUDE_PROJECT_DIR\}\/(\S+?\.(?:mjs|js|sh|ps1))/g)) {
          if (!existsSync(path.join(projectRoot, m[1]))) problems.push(`${event} hook script missing: ${m[1]}`);
        }
      }
    }
  }
  if (perms.disableBypassPermissionsMode !== 'disable') console.log('  note: permissions.disableBypassPermissionsMode is not "disable" (permission prompts can be switched off at start-up)');
  if (problems.length) exitCode = 1;
  for (const p of problems) console.log(`  PROBLEM: ${p}`);
}
process.exit(exitCode);
