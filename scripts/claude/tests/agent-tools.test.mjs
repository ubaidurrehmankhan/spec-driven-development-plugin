// Behaviour tests for scripts/claude/agent-tools.mjs (the agent deny-list policy). Uses a temp folder.
// Usage: node scripts/claude/tests/agent-tools.test.mjs
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(here, '..', '..', '..');
const SCRIPT = path.join(REPO, 'scripts', 'claude', 'agent-tools.mjs');
let pass = 0;
let fail = 0;
const t = (name, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : `  ${extra}`}`);
  cond ? pass++ : fail++;
};

const dir = mkdtempSync(path.join(tmpdir(), 'agent-tools-'));
mkdirSync(path.join(dir, 'scripts', 'claude'), { recursive: true });
mkdirSync(path.join(dir, '.claude', 'agents'), { recursive: true });
copyFileSync(path.join(REPO, 'scripts', 'claude', 'agent-tool-policy.json'), path.join(dir, 'scripts', 'claude', 'agent-tool-policy.json'));
const policy = JSON.parse(readFileSync(path.join(dir, 'scripts', 'claude', 'agent-tool-policy.json'), 'utf8'));

const run = (cmd) => spawnSync(process.execPath, [SCRIPT, cmd, dir], { encoding: 'utf8' });
const fixer = path.join(dir, '.claude', 'agents', 'jira-bug-fixer.md');
const impl = path.join(dir, '.claude', 'agents', 'nestjs-batch-implementer.md');
writeFileSync(fixer, '---\nname: jira-bug-fixer\ndescription: x\nmodel: sonnet\ndisallowedTools: mcp__claude_ai_Slack\n---\nBody line\r\nwith a CR\n');
writeFileSync(impl, '---\nname: nestjs-batch-implementer\ndescription: x\nmodel: sonnet\n---\nBody\n');
const triager = path.join(dir, '.claude', 'agents', 'jira-bug-triager.md');
writeFileSync(triager, '---\nname: jira-bug-triager\ndescription: x\nmodel: sonnet\n---\nBody\n');

let r = run('check');
t('check reports stale agents and exits 1', r.status === 1 && /STALE .*jira-bug-fixer/.test(r.stdout) && /STALE .*nestjs-batch-implementer.*no disallowedTools line/.test(r.stdout), r.stdout);

r = run('apply');
t('apply exits 0 and writes both', r.status === 0 && /wrote .*jira-bug-fixer/.test(r.stdout) && /wrote .*nestjs-batch-implementer/.test(r.stdout), r.stdout);
r = run('check');
t('check is clean after apply', r.status === 0, r.stdout);

const fixerText = readFileSync(fixer, 'utf8');
const line = fixerText.match(/^disallowedTools: (.*)$/m)[1].split(', ');
t('jira agent withholds every outward server and every Atlassian write tool', policy.outward.every((x) => line.includes(x)) && policy.profiles.jira.extra.every((x) => line.includes(x)));
t('jira agent keeps Atlassian READ tools (not denied)', !line.includes('mcp__claude_ai_Atlassian_Rovo__getJiraIssue') && !line.includes('mcp__claude_ai_Atlassian_Rovo'));
const implLine = readFileSync(impl, 'utf8').match(/^disallowedTools: (.*)$/m)[1].split(', ');
t('implementer withholds every Atlassian server entirely', policy.profiles.implementer.extra.every((x) => implLine.includes(x)));
t('context7 is never denied', !line.includes('mcp__context7') && !implLine.includes('mcp__context7') && !policy.outward.some((x) => /context7/.test(x)));
t('nothing else in the file changed (body and the CR kept)', fixerText.includes('Body line\r\nwith a CR\n') && fixerText.startsWith('---\nname: jira-bug-fixer\ndescription: x\nmodel: sonnet\n'));

const before = readFileSync(fixer, 'utf8');
run('apply');
t('apply is idempotent', readFileSync(fixer, 'utf8') === before);

// CRLF files keep CRLF
writeFileSync(impl, '---\r\nname: nestjs-batch-implementer\r\ndescription: x\r\nmodel: sonnet\r\n---\r\nBody\r\n');
run('apply');
const crlf = readFileSync(impl, 'utf8');
t('CRLF agent file keeps CRLF endings', !/[^\r]\n/.test(crlf) && /disallowedTools:/.test(crlf));

// an allowlist and a deny list together is a mistake: report it
writeFileSync(impl, '---\nname: nestjs-batch-implementer\ndescription: x\ntools: Read, Grep\nmodel: sonnet\n---\nBody\n');
r = run('apply');
t('an agent with a tools allowlist is reported, not rewritten', r.status === 1 && /has a tools allowlist/.test(r.stdout) && !/disallowedTools/.test(readFileSync(impl, 'utf8')), r.stdout);

// drift is detected
writeFileSync(impl, '---\nname: nestjs-batch-implementer\ndescription: x\nmodel: sonnet\n---\nBody\n');
run('apply');
writeFileSync(impl, readFileSync(impl, 'utf8').replace(', mcp__claude_ai_Gmail', ''));
r = run('check');
t('removing one entry by hand is detected', r.status === 1 && /STALE .*nestjs-batch-implementer.*1 missing/.test(r.stdout), r.stdout);

// a typo in a policy path must not leave an agent silently unprotected; optional entries may be absent
const dir2 = mkdtempSync(path.join(tmpdir(), 'agent-tools2-'));
mkdirSync(path.join(dir2, 'scripts', 'claude'), { recursive: true });
mkdirSync(path.join(dir2, '.claude', 'agents'), { recursive: true });
const policy2 = { ...policy, agents: [{ path: '.claude/agents/jira-bug-fixr.md', profile: 'jira' }, { path: '.claude/agents/absent-but-optional.md', profile: 'implementer', optional: true }] };
writeFileSync(path.join(dir2, 'scripts', 'claude', 'agent-tool-policy.json'), JSON.stringify(policy2));
r = spawnSync(process.execPath, [SCRIPT, 'check', dir2], { encoding: 'utf8' });
t('a required policy path that does not exist is an error (typo caught)', r.status === 1 && /jira-bug-fixr\.md: is listed in agent-tool-policy\.json but does not exist/.test(r.stdout) && !/absent-but-optional/.test(r.stdout), r.stdout);

// a model: line in the BODY must never be used as the anchor; a missing frontmatter model: line is an error, not a body edit
const bodyOnly = path.join(dir2, '.claude', 'agents', 'jira-bug-fixer.md');
const original = '---\nname: jira-bug-fixer\ndescription: x\n---\nintro\nmodel: this line is in the body\n';
writeFileSync(bodyOnly, original);
writeFileSync(path.join(dir2, 'scripts', 'claude', 'agent-tool-policy.json'), JSON.stringify({ ...policy, agents: [{ path: '.claude/agents/jira-bug-fixer.md', profile: 'jira' }] }));
r = spawnSync(process.execPath, [SCRIPT, 'apply', dir2], { encoding: 'utf8' });
t('no model: line in the frontmatter: reported, and the body is untouched', r.status === 1 && /no model: line in the frontmatter/.test(r.stdout) && readFileSync(bodyOnly, 'utf8') === original, r.stdout);

// the YAML list form cannot be maintained from the policy: say so instead of producing broken YAML
writeFileSync(bodyOnly, '---\nname: jira-bug-fixer\ndescription: x\nmodel: sonnet\ndisallowedTools:\n  - mcp__claude_ai_Slack\n---\nBody\n');
r = spawnSync(process.execPath, [SCRIPT, 'apply', dir2], { encoding: 'utf8' });
t('a YAML-list disallowedTools is reported, not half-rewritten', r.status === 1 && /YAML list/.test(r.stdout) && /  - mcp__claude_ai_Slack/.test(readFileSync(bodyOnly, 'utf8')), r.stdout);

// duplicate entries count as drift
writeFileSync(bodyOnly, '---\nname: jira-bug-fixer\ndescription: x\nmodel: sonnet\n---\nBody\n');
spawnSync(process.execPath, [SCRIPT, 'apply', dir2], { encoding: 'utf8' });
writeFileSync(bodyOnly, readFileSync(bodyOnly, 'utf8').replace('disallowedTools: mcp__claude_ai_Slack', 'disallowedTools: mcp__claude_ai_Slack, mcp__claude_ai_Slack'));
r = spawnSync(process.execPath, [SCRIPT, 'check', dir2], { encoding: 'utf8' });
t('a duplicated entry is detected as drift', r.status === 1 && /STALE/.test(r.stdout), r.stdout);

// a malformed policy is reported cleanly (exit 2), not with a stack trace
writeFileSync(path.join(dir2, 'scripts', 'claude', 'agent-tool-policy.json'), '{ nope');
r = spawnSync(process.execPath, [SCRIPT, 'check', dir2], { encoding: 'utf8' });
t('a malformed policy gives a clear message and exit 2', r.status === 2 && /not valid JSON/.test(r.stderr) && !/at .*agent-tools\.mjs/.test(r.stderr), r.stderr);

// the repository's own policy is consistent
r = spawnSync(process.execPath, [SCRIPT, 'check', REPO], { encoding: 'utf8' });
t('the repository agents are in step with the policy', r.status === 0, r.stdout);
t('policy has the three Atlassian connectors in the jira profile', ['Atlassian_MCP', 'Atlassian_Rovo', 'Atlassian_Rovo_2'].every((s) => policy.profiles.jira.extra.some((x) => x.startsWith(`mcp__claude_ai_${s}__`))));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
