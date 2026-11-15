// PostToolUse (matcher: Write|Edit|MultiEdit|NotebookEdit): record the edited file for this session and format it.
// Kept fast on purpose (prettier ~3 s). Lint and tests run once per turn in stop-gate.mjs, not after every edit.
import { appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { loadConfig, norm, projectDir, readInput, resolveFile, runBin, toRegex } from './lib.mjs';

const input = readInput();
const file = resolveFile(input, input.tool_input ?? {});
if (!file) process.exit(0);

const session = String(input.session_id ?? 'nosession').replace(/[^\w-]/g, '');
appendFileSync(path.join(tmpdir(), `claude-edits-${session}.txt`), `${file}\n`);

const root = projectDir(input);
const { sourceFileRegex, format } = loadConfig(root);
if (format?.pkg && sourceFileRegex && toRegex(sourceFileRegex).test(file)) {
  const args = (format.args ?? ['--write', '{file}']).map((a) => (a === '{file}' ? file : a));
  runBin(root, format.pkg, args, { timeout: 30000 });
}
