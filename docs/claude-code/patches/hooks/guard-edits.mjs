// PreToolUse (matcher: Write|Edit|MultiEdit|NotebookEdit): protect files that must not be changed by an agent.
// Project parameters (immutable folders, policy files) come from .claude/hooks.config.json; the guardrail files themselves
// are protected by a built-in baseline (lib.mjs) that does not depend on that file.
import path from 'node:path';
import { ask, block, collectText, failClosed, findSecret, loadConfig, norm, projectDir, readInput, resolveFile, run, toRegex } from './lib.mjs';

const ENV_FILE = /(^|\/)\.env(\.(?!example$)[^/]+)?$/i;

failClosed(main);

function main() {
  const input = readInput();
  const ti = input.tool_input ?? {};
  const file = resolveFile(input, ti); // absolute, forward slashes: a relative path or odd casing must not dodge a rule
  if (!file) process.exit(0);

  const root = projectDir(input);
  const config = loadConfig(root);

  if (ENV_FILE.test(file)) {
    block('Blocked: .env files are never edited by Claude. Change .env.example and document the variable instead.');
  }

  const immutableFile = toRegex(config.immutableFileRegex);
  if (config.immutableDirs.some((dir) => file.toLowerCase().includes(String(dir).toLowerCase())) && immutableFile.test(file)) {
    const rel = norm(path.relative(root, file));
    const committed = run('git', ['cat-file', '-e', `HEAD:${rel}`], { cwd: root }).code === 0;
    if (committed) {
      block(`Blocked: ${rel} is already committed. ${config.immutableHint}`);
    }
  }

  for (const policy of config.policyFiles) {
    if ((policy.patterns ?? []).some((p) => toRegex(p).test(file))) {
      block(String(policy.message ?? 'Blocked: {file} is protected by project policy.').replaceAll('{file}', file));
    }
  }

  // Optional: files a person must approve (permission prompt) instead of a hard block, for example CLAUDE.md or CI.
  for (const policy of config.askFiles) {
    if ((policy.patterns ?? []).some((p) => toRegex(p).test(file))) {
      ask(String(policy.message ?? 'Confirm: {file} changes how Claude behaves or what CI runs.').replaceAll('{file}', file));
    }
  }

  const secret = findSecret(collectText(ti));
  if (secret) {
    block(`Blocked: the content to be written contains ${secret}. Use an environment variable and document it in .env.example.`);
  }
}
