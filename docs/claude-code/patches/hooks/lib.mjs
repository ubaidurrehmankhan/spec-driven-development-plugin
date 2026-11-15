// Shared helpers for Claude Code hook scripts. Node >= 18, no dependencies.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

// Bump when a guard rule changes in a way the regression table in scripts/claude/tests/hooks.test.mjs must enforce.
// The test suite switches its known-gap cases from TODO to strict at version 2 and above.
export const GUARDRAIL_VERSION = 2;

export function readInput() {
  try {
    return JSON.parse(readFileSync(0, 'utf8') || '{}');
  } catch {
    return {};
  }
}

export const norm = (p) => String(p ?? '').replaceAll('\\', '/');

export const projectDir = (input) => norm(process.env.CLAUDE_PROJECT_DIR ?? input.cwd ?? process.cwd());

// The guardrail files are protected even when hooks.config.json is missing, unreadable or edited: a guard must not
// depend on a file it protects. Patterns are case-insensitive (Windows paths are).
const BASELINE_POLICY = {
  patterns: ['/\\.claude/settings(\\.[\\w-]+)?\\.json$', '/\\.claude/hooks/', '/\\.claude/hooks\\.config\\.json$'],
  message: 'Blocked: {file} holds the guardrails. Describe the change you need and let the developer make it.',
};

// Per-project parameters live in .claude/hooks.config.json so the hook code is identical in every project.
// A missing or unreadable file means: baseline guardrail protection, env-file guard, secret guard and destructive-command guard only.
const CONFIG_DEFAULTS = {
  sourceFileRegex: null, // files that count as source (format after edit, checked by the stop gate)
  immutableDirs: [], // committed files under these folders must not be edited (for example migrations)
  immutableFileRegex: '\\.(ts|js|sql)$',
  immutableHint: 'Never edit a shipped file in this folder; add a new one instead.',
  policyFiles: [BASELINE_POLICY], // [{ patterns: [regex strings], message: 'Blocked: {file} ...' }]
  askFiles: [], // same shape as policyFiles, but a person decides (permission prompt) instead of a block
  format: null, // { pkg, args } with {file}
  stopGate: { checks: [] }, // [{ label, pkg, args }] with {files} and {tmp}
  askBeforeInstall: false,
  owaspGuard: { enabled: true, skipPathRegex: '(\\.(spec|test)\\.|/__tests__/|/tests?/|/e2e/|\\.d\\.ts$)' }, // insecure-code guard; test files are skipped
};

export function loadConfig(root) {
  try {
    const raw = JSON.parse(readFileSync(path.join(root, '.claude', 'hooks.config.json'), 'utf8'));
    const own = Array.isArray(raw.policyFiles) ? raw.policyFiles : [];
    return {
      ...CONFIG_DEFAULTS,
      ...raw,
      policyFiles: [BASELINE_POLICY, ...own],
      askFiles: Array.isArray(raw.askFiles) ? raw.askFiles : [],
      stopGate: { ...CONFIG_DEFAULTS.stopGate, ...(raw.stopGate ?? {}) },
      owaspGuard: { ...CONFIG_DEFAULTS.owaspGuard, ...(raw.owaspGuard ?? {}) },
    };
  } catch {
    return { ...CONFIG_DEFAULTS };
  }
}

export const toRegex = (s) => new RegExp(s, 'i');

// Exit code 2 blocks the action; stderr is fed back to Claude (or shown to the user, per event).
// Any other non-zero exit (a crash, an uncaught exception) is NON-blocking in Claude Code, so a guard must call
// failClosed() so that its own bugs stop the action instead of waving it through.
export function block(reason) {
  process.stderr.write(`${reason}\n`);
  process.exit(2);
}

export function failClosed(fn) {
  try {
    fn();
  } catch (e) {
    block(`Blocked: a guard hook failed (${e?.message ?? e}). Failing closed. Report this to the developer; do not work around it.`);
  }
}

// PreToolUse only: show the normal permission prompt instead of allowing silently.
export function ask(reason) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'ask',
        permissionDecisionReason: reason,
      },
    }),
  );
  process.exit(0);
}

// Hooks only ever run git and node, which are real executables on every OS, so no shell is used: a path or an argument
// that Claude controls is never parsed by cmd.exe or sh. (Package tools such as eslint go through runBin below.)
export function run(cmd, args = [], opts = {}) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', ...opts });
  return { code: r.status ?? 1, out: `${r.stdout ?? ''}${r.stderr ?? ''}` };
}

// Every field of a write-type tool call that can carry new text: Write (content), Edit (new_string), MultiEdit (edits[]),
// NotebookEdit (new_source). Scanning only some of them lets a secret or insecure code through the others.
export function collectText(ti = {}) {
  const edits = Array.isArray(ti.edits) ? ti.edits.map((e) => e?.new_string ?? '') : [];
  return [ti.content, ti.new_string, ti.new_source, ...edits].filter((x) => typeof x === 'string' && x).join('\n');
}

// Absolute, forward-slash path of the file a tool call targets, resolved against the session's working directory
// (a relative path must not dodge a path rule).
export function resolveFile(input, ti = {}) {
  const raw = norm(ti.file_path ?? ti.notebook_path ?? '');
  if (!raw) return '';
  return norm(path.resolve(norm(input.cwd ?? process.env.CLAUDE_PROJECT_DIR ?? process.cwd()), raw));
}

// Patterns that should never appear in a prompt, a command or a written file.
export const SECRET_PATTERNS = [
  [/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/, 'a JWT'],
  [/\bAKIA[0-9A-Z]{16}\b/, 'an AWS access key id'],
  [/\bASIA[0-9A-Z]{16}\b/, 'an AWS temporary access key id'],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'a private key'],
  [/\bgh[pousr]_[A-Za-z0-9]{36,}\b/, 'a GitHub token'],
  [/\bxox[baprs]-[A-Za-z0-9-]{10,}/, 'a Slack token'],
  [/\bAIza[0-9A-Za-z_-]{35}\b/, 'a Google API key'],
  [/\bsk-(ant-)?[A-Za-z0-9_-]{32,}/, 'an API secret key (sk-...)'],
  [/\b[sr]k_live_[0-9A-Za-z]{16,}/, 'a Stripe live key'],
  [/\bnpm_[A-Za-z0-9]{36}\b/, 'an npm token'],
  [/\bglpat-[A-Za-z0-9_-]{20,}/, 'a GitLab token'],
  [/\bSG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}/, 'a SendGrid key'],
];

// Looser patterns, only for prompts and shell commands (too noisy for test fixtures in source files).
export const LITERAL_CREDENTIAL_PATTERNS = [
  [/Bearer\s+(?!\$|\{|<)[A-Za-z0-9._~+/-]{30,}/, 'a literal bearer token'],
  [/"password"\s*:\s*"(?!\$|\{\{|<)[^"]{6,}"/i, 'a literal password in a JSON body'],
  [/\b(postgres(ql)?|mysql|mongodb(\+srv)?|redis|amqp):\/\/[^\s:@/]+:(?!\$|\{|<|%)[^\s@/]{3,}@/i, 'a connection string with a literal password'],
  [/aws_secret_access_key\s*[=:]\s*['"]?[A-Za-z0-9/+=]{40}/i, 'an AWS secret access key'],
];

export function findSecret(text, patterns = SECRET_PATTERNS) {
  for (const [re, label] of patterns) if (re.test(text)) return label;
  return null;
}

// Run a locally installed tool (eslint, jest, prettier...) through node: no shell, no npx, no network download.
// binName picks one entry when a package ships several (typescript: tsc). Returns code 127 when the package is not installed so callers can skip instead of failing.
export function runBin(root, pkg, args = [], { bin: binName, ...opts } = {}) {
  const pj = path.join(root, 'node_modules', pkg, 'package.json');
  if (!existsSync(pj)) return { code: 127, out: `${pkg} is not installed in ${root}` };
  const bin = JSON.parse(readFileSync(pj, 'utf8')).bin;
  const rel = typeof bin === 'string' ? bin : bin?.[binName ?? pkg];
  if (!rel) return { code: 127, out: `${pkg} has no bin entry` };
  const r = spawnSync(process.execPath, [path.join(root, 'node_modules', pkg, rel), ...args], {
    encoding: 'utf8',
    cwd: root,
    ...opts,
  });
  return { code: r.status ?? 1, out: `${r.stdout ?? ''}${r.stderr ?? ''}` };
}
