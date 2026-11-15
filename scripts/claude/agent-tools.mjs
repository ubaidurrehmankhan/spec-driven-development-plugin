// Keep the `disallowedTools:` line of agents that have no `tools:` allowlist in step with scripts/claude/agent-tool-policy.json.
//   node scripts/claude/agent-tools.mjs check [project-root]   exit 1 and list the agents that are out of step
//   node scripts/claude/agent-tools.mjs apply [project-root]   rewrite the line (nothing else in the file changes)
// A policy entry whose file does not exist is an error unless the entry says "optional": true (a preset's agent only exists
// for some stacks). A typo in a path must never leave an agent silently unprotected.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export function loadPolicy(root) {
  const file = path.join(root, 'scripts', 'claude', 'agent-tool-policy.json');
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (e) {
    throw new Error(`scripts/claude/agent-tool-policy.json is not valid JSON (${e.message})`);
  }
}

// The deny entries an agent of this profile must carry, in a stable order without duplicates.
export function expectedFor(policy, profile) {
  const extra = policy.profiles?.[profile]?.extra;
  if (!extra) throw new Error(`unknown profile "${profile}" in agent-tool-policy.json`);
  return [...new Set([...policy.outward, ...extra])];
}

const LINE = /^disallowedTools:.*$/m;
const FRONT = /^(---\r?\n[\s\S]*?)(\r?\n---)/;

export function inspect(root, policy) {
  const rows = [];
  for (const a of policy.agents ?? []) {
    const file = path.join(root, a.path);
    if (!existsSync(file)) {
      if (!a.optional) rows.push({ file, path: a.path, problem: 'is listed in agent-tool-policy.json but does not exist (mark the entry "optional": true if it only exists for some stacks)' });
      continue;
    }
    const text = readFileSync(file, 'utf8');
    const fm = text.match(FRONT);
    if (!fm) {
      rows.push({ file, path: a.path, problem: 'no frontmatter' });
      continue;
    }
    const front = fm[1].replace(/\r\n/g, '\n');
    if (/^tools:/m.test(front)) {
      rows.push({ file, path: a.path, problem: 'has a tools allowlist; remove it from the policy or the file' });
      continue;
    }
    const lineMatch = front.match(/^disallowedTools:(.*)$/m);
    if (lineMatch && (lineMatch[1].trim() === '' || /^disallowedTools:.*\n\s*-\s/m.test(front))) {
      rows.push({ file, path: a.path, problem: 'disallowedTools is a YAML list; use one comma-separated line so it can be maintained from the policy' });
      continue;
    }
    const want = expectedFor(policy, a.profile);
    const have = (lineMatch?.[1] ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    const missing = want.filter((x) => !have.includes(x));
    const duplicates = have.filter((x, i) => have.indexOf(x) !== i);
    const extra = [...have.filter((x) => !want.includes(x)), ...duplicates];
    rows.push({ file, path: a.path, text, frontEnd: fm[1].length, crlf: text.includes('\r\n'), want, missing, extra, hasLine: Boolean(lineMatch) });
  }
  return rows;
}

function main() {
  const [cmd, rootArg] = process.argv.slice(2);
  const root = path.resolve(rootArg ?? process.cwd());
  let policy;
  try {
    policy = loadPolicy(root);
  } catch (e) {
    console.error(e.message);
    process.exit(2);
  }
  if (!policy) {
    console.error('no scripts/claude/agent-tool-policy.json');
    process.exit(2);
  }
  if (!['check', 'apply'].includes(cmd)) {
    console.error('usage: agent-tools.mjs <check|apply> [project-root]');
    process.exit(2);
  }
  let bad = 0;
  for (const r of inspect(root, policy)) {
    if (r.problem) {
      bad++;
      console.log(`ERROR ${r.path}: ${r.problem}`);
      continue;
    }
    if (r.hasLine && r.missing.length === 0 && r.extra.length === 0) {
      console.log(`ok    ${r.path}`);
      continue;
    }
    if (cmd === 'check') {
      bad++;
      console.log(`STALE ${r.path}: ${r.hasLine ? `${r.missing.length} missing, ${r.extra.length} not in the policy or duplicated` : 'no disallowedTools line'}`);
      continue;
    }
    // Edit one line inside the frontmatter only (never the body), so every other byte, including each line ending, stays as it was.
    const line = `disallowedTools: ${r.want.join(', ')}`;
    const front = r.text.slice(0, r.frontEnd);
    const eol = r.crlf ? '\r\n' : '\n';
    const nextFront = r.hasLine ? front.replace(LINE, () => line) : front.replace(/^(model:[^\r\n]*)/m, (m) => `${m}${eol}${line}`);
    if (nextFront === front) {
      bad++;
      console.log(`ERROR ${r.path}: could not place the disallowedTools line (no model: line in the frontmatter to anchor it)`);
      continue;
    }
    writeFileSync(r.file, nextFront + r.text.slice(r.frontEnd));
    console.log(`wrote ${r.path} (${r.want.length} entries)`);
  }
  process.exit(bad ? 1 : 0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
