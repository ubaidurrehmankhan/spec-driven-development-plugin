// SessionStart (matcher: startup|resume|clear|compact): print the context Claude needs; stdout is added to context.
import path from 'node:path';
import { projectDir, readInput, run } from './lib.mjs';

const input = readInput();
const root = projectDir(input);
const git = (args) => run('git', args, { cwd: root }).out.trim();

const branch = git(['branch', '--show-current']) || '(detached)';
const ticket = (branch.match(/[A-Za-z][A-Za-z0-9]+-\d+/) ?? [])[0];
const dirty = git(['status', '--porcelain']).split('\n').filter(Boolean).length;

const lines = [
  `Branch: ${branch}${ticket ? ` (ticket ${ticket.toUpperCase()})` : ''}`,
  `Working tree: ${dirty === 0 ? 'clean' : `${dirty} changed paths (do not touch unrelated files)`}`,
  'Security floor (non-negotiable): OWASP rules apply to every change; see .claude/rules/security-floor.md. Run the security-reviewer agent before calling code work done.',
  `Changing hooks, settings, commands, agents, skills or scripts? Load the guardrail-change-review skill first (${path.join('.claude', 'skills', 'guardrail-change-review')}).`,
];

if (input.source === 'compact') {
  lines.push('Context was compacted: re-read the active plan/todo file before continuing; keep the modified-files list and test commands.');
}

process.stdout.write(`${lines.join('\n')}\n`);
