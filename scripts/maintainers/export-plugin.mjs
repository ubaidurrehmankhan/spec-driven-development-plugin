// Maintainers only. Generate the plugin files of spec-driven-web-plugin from this boilerplate (the generic master).
//   node scripts/maintainers/export-plugin.mjs --to <plugin-dir> [--dry-run]
// It writes only generated paths (commands, agents, skills, templates, walkthroughs, scripts, optional) and never touches
// README.md, INSTALL.md, CHANGELOG.md, scripts/init-project.mjs, manifests or anything it does not generate.
// Path rewrites: `.claude/templates/` -> `templates/`, CHANGES.md -> CHANGELOG.md, the dormant FastAPI link -> the real skill folder.
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(here, '..', '..');
const args = process.argv.slice(2);
const to = args.includes('--to') ? path.resolve(args[args.indexOf('--to') + 1]) : null;
const dry = args.includes('--dry-run');
if (!to || !existsSync(path.join(to, '.claude-plugin', 'plugin.json'))) {
  console.error('ERROR --to must point at a plugin folder that contains .claude-plugin/plugin.json');
  process.exit(1);
}

const written = [];
const out = (rel, text) => {
  written.push(rel);
  if (dry) return;
  const f = path.join(to, rel);
  // Leave a file alone when only its line endings would change.
  if (existsSync(f) && typeof text === 'string' && readFileSync(f, 'utf8').replaceAll('\r\n', '\n') === text) return;
  mkdirSync(path.dirname(f), { recursive: true });
  writeFileSync(f, text);
};
const read = (p) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
const isText = (f) => /\.(md|mjs|json|template)$/.test(f);
const walk = (dir) =>
  existsSync(dir)
    ? readdirSync(dir).flatMap((n) => {
        const p = path.join(dir, n);
        return statSync(p).isDirectory() ? walk(p) : [p];
      })
    : [];

const SCRIPTS_NOTE =
  '> - **Scripts:** `node scripts/claude/batch-plan.mjs` is copied into the project by the plugin\'s `scripts/init-project.mjs`. If it is not there, say so and continue without the mechanical plan check; do not invent its output.';

function toPlugin(text, kind) {
  let t = text
    .replace('The generic spec-driven workflow lives in `.claude/commands`, `.claude/skills`, `.claude/agents` and `.claude/templates`.', 'The generic spec-driven workflow comes from the spec-driven-web-plugin (its commands, skills, agents and templates).')
    .replace('What differs from the original plugin is listed in `.claude/spec-driven/CHANGES.md`.', "What changed between plugin versions is listed in the plugin's `CHANGELOG.md`.")
    .replaceAll('.claude/templates/', 'templates/')
    .replaceAll('../../spec-driven/optional/skills/fastapi-backend/SKILL.md', '../fastapi-backend/SKILL.md')
    .replace(' (dormant; not loaded)', '')
    .replaceAll('Skill names must match folders in `.claude/skills/`.', 'Skill names must match the available skills (the plugin\'s `skills/` folder, or `.claude/skills/` in a project that carries its own).')
    .replace(
      /\(added when this file was vendored from the spec-driven plugin v0\.1\.0; everything below it is unchanged from upstream except where listed in `\.claude\/spec-driven\/CHANGES\.md`\)/,
      '(added in plugin v0.2.0; see `CHANGELOG.md` in the plugin for what changed from v0.1.0)',
    )
    .replace(/\(this command is an addition to the spec-driven workflow; see `\.claude\/spec-driven\/CHANGES\.md`\)/, '(added in plugin v0.2.0; see `CHANGELOG.md` in the plugin)')
    .replaceAll('`.claude/spec-driven/CHANGES.md`', '`CHANGELOG.md`');
  if (kind === 'command' && t.includes('batch-plan.mjs') && !t.includes('**Scripts:**')) {
    t = t.replace(/(> - \*\*No profile\?\*\*)/, `${SCRIPTS_NOTE}\n$1`);
  }
  return t;
}

function copyDir(fromDir, toRel, kind, filter = () => true) {
  for (const f of walk(fromDir)) {
    if (!filter(f)) continue;
    const rel = path.join(toRel, path.relative(fromDir, f)).split(path.sep).join('/');
    out(rel, isText(f) ? toPlugin(read(f), kind) : readFileSync(f));
  }
}

// commands, agents, skills, templates, walkthroughs
copyDir(path.join(SRC, '.claude', 'commands'), 'commands', 'command');
copyDir(path.join(SRC, '.claude', 'agents'), 'agents', 'agent');
copyDir(path.join(SRC, 'presets', 'nestjs-backend', 'files', '.claude', 'agents'), 'agents', 'agent');
copyDir(path.join(SRC, '.claude', 'spec-driven', 'optional', 'agents'), 'agents', 'agent');
copyDir(path.join(SRC, '.claude', 'skills'), 'skills', 'skill');
copyDir(path.join(SRC, 'presets', 'nestjs-backend', 'files', '.claude', 'skills'), 'skills', 'skill');
copyDir(path.join(SRC, '.claude', 'spec-driven', 'optional', 'skills'), 'skills', 'skill');
copyDir(path.join(SRC, '.claude', 'templates'), 'templates', 'template');
out('templates/project-profile.template.md', toPlugin(read(path.join(SRC, '.claude', 'spec-driven', 'project-profile.template.md')), 'template'));
out('templates/decisions-log.md.template', toPlugin(read(path.join(SRC, 'docs', 'DECISIONS.md')), 'template'));
copyDir(path.join(SRC, '.claude', 'spec-driven', 'walkthroughs'), 'walkthroughs', 'doc');

// scripts and their tests
for (const n of ['batch-plan.mjs', 'validate-workflow.mjs']) out(`scripts/${n}`, read(path.join(SRC, 'scripts', 'claude', n)));
for (const n of ['batch-plan.test.mjs', 'hooks.test.mjs']) out(`scripts/tests/${n}`, read(path.join(SRC, 'scripts', 'claude', 'tests', n)));

// optional files a project may copy: hooks, rules, preset data (nothing here is auto-registered)
copyDir(path.join(SRC, '.claude', 'hooks'), 'optional/hooks', 'hook');
copyDir(path.join(SRC, '.claude', 'rules'), 'optional/rules', 'rule');
copyDir(path.join(SRC, 'presets', 'nestjs-backend', 'files', '.claude', 'rules'), 'optional/presets/nestjs-backend/rules', 'rule');
for (const n of ['preset.json', 'profile-fragment.md', 'skill-map-rows.md']) {
  out(`optional/presets/nestjs-backend/${n}`, read(path.join(SRC, 'presets', 'nestjs-backend', n)));
}
out('optional/presets/generic/preset.json', read(path.join(SRC, 'presets', 'generic', 'preset.json')));
const settings = JSON.parse(read(path.join(SRC, '.claude', 'settings.json')));
out('optional/hooks/settings.snippet.json', `${JSON.stringify({ permissions: settings.permissions, hooks: settings.hooks }, null, 2)}\n`);
out('optional/hooks/hooks.config.example.json', `${JSON.stringify(JSON.parse(read(path.join(SRC, 'presets', 'nestjs-backend', 'preset.json'))).hooksConfig, null, 2)}\n`);

console.log(`${dry ? '[dry run] ' : ''}${written.length} files ${dry ? 'would be ' : ''}written under ${to}`);
const byTop = {};
for (const w of written) byTop[w.split('/')[0]] = (byTop[w.split('/')[0]] ?? 0) + 1;
console.log(byTop);
