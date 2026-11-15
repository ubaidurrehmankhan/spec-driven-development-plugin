// Stop: if this session edited source files, run the configured checks on them; block the stop until green.
// Checks come from .claude/hooks.config.json (stopGate.checks). With no checks configured this hook does nothing.
// Claude Code caps consecutive Stop-hook continuations (8 by default, reset when a tool is called; env
// CLAUDE_CODE_STOP_HOOK_BLOCK_CAP raises it) and sets stop_hook_active when it is already continuing because of a hook.
// This hook also stops re-blocking on a failure Claude was already told about and could not change, so a lint error that
// pre-dates the session does not burn the whole cap on every turn.
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { loadConfig, norm, projectDir, readInput, runBin, toRegex } from './lib.mjs';

const input = readInput();
const root = projectDir(input);
const config = loadConfig(root);
if (!config.sourceFileRegex || config.stopGate.checks.length === 0) process.exit(0);

const session = String(input.session_id ?? 'nosession').replace(/[^\w-]/g, '');
const listFile = path.join(tmpdir(), `claude-edits-${session}.txt`);
if (!existsSync(listFile)) process.exit(0);

const sourceRe = toRegex(config.sourceFileRegex);
const files = [...new Set(readFileSync(listFile, 'utf8').split('\n').map(norm).filter(Boolean))].filter(
  (f) => sourceRe.test(f) && existsSync(f),
);
if (files.length === 0) process.exit(0);

// Skip when nothing changed since the last green run.
const stamp = files.map((f) => `${f}:${statSync(f).mtimeMs}`).join('|');
const marker = path.join(tmpdir(), `claude-verified-${session}.txt`);
if (existsSync(marker) && readFileSync(marker, 'utf8') === stamp) process.exit(0);

// Already continuing because of this hook, and the files are exactly as they were when it last blocked: let Claude stop.
const failedMarker = path.join(tmpdir(), `claude-failed-${session}.txt`);
if (input.stop_hook_active && existsSync(failedMarker) && readFileSync(failedMarker, 'utf8') === stamp) process.exit(0);

const tmp = norm(tmpdir());
const skipped = [];
for (const check of config.stopGate.checks) {
  const args = (check.args ?? []).flatMap((a) => (a === '{files}' ? files : [String(a).replaceAll('{tmp}', tmp)]));
  const r = runBin(root, check.pkg, args, { timeout: 280000, bin: check.bin });
  if (r.code === 127) {
    // Tool not installed here: do not block, but say so, so a missing tool never looks like a green check.
    skipped.push(check.label ?? check.pkg);
    continue;
  }
  if (r.code !== 0) {
    writeFileSync(failedMarker, stamp);
    process.stdout.write(
      JSON.stringify({
        decision: 'block',
        reason: `${check.label ?? check.pkg} failed for the files edited this session. Fix it before finishing.\n${r.out.slice(-3000)}`,
      }),
    );
    process.exit(0);
  }
}
writeFileSync(marker, stamp);
if (skipped.length) {
  process.stdout.write(
    JSON.stringify({ systemMessage: `Stop gate: NOT RUN (tool not installed): ${skipped.join(', ')}. Run npm install, then npm run verify.` }),
  );
}
