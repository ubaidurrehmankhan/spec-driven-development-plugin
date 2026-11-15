// PreToolUse (matcher: Bash|PowerShell): deny dangerous commands, force secrets into env vars, ask on sensitive ones.
// Bash rules are not a security boundary (a determined caller can always find another spelling); this guard removes the
// common spellings, in both shells, and CI plus the security-reviewer agent remain the real gates.
import { LITERAL_CREDENTIAL_PATTERNS, SECRET_PATTERNS, ask, block, failClosed, findSecret, loadConfig, projectDir, readInput } from './lib.mjs';

failClosed(main);

function main() {
  const input = readInput();
  const cmd = String(input.tool_input?.command ?? '');
  if (!cmd) process.exit(0);

  // Only the text of a message argument (-m "..." / -am "..." / --message "...") is ignored by the flag rules, so a commit
  // message that mentions a flag does not trigger them. Everything else, including quoted text inside `bash -c "..."`,
  // is tested as written, so wrapping a command in a nested shell does not hide it.
  const flagsOnly = cmd.replace(/(\s(?:-[a-zA-Z]*m|--message)(?:\s+|=))(["'])(?:\\.|(?!\2).)*\2/g, '$1""');

  // `git -C dir push`, `git -c k=v push` and friends put options between `git` and the subcommand. Strip them so every
  // git rule below sees `git <subcommand> ...`.
  const ARG = String.raw`(?:"[^"]*"|'[^']*'|\S+)`;
  const GIT_GLOBAL = new RegExp(
    String.raw`\bgit\s+(?:-C\s+${ARG}|-c\s+${ARG}|--git-dir(?:=|\s+)${ARG}|--work-tree(?:=|\s+)${ARG}|--no-pager|--no-optional-locks|--bare|-p)\s+`,
    'g',
  );
  let gitCmd = flagsOnly;
  for (let i = 0; i < 8; i++) {
    const next = gitCmd.replace(GIT_GLOBAL, 'git ');
    if (next === gitCmd) break;
    gitCmd = next;
  }

  // Segment-local matching: [^\n;&|]* stays inside one command of a compound line.
  const DENY_GIT = [
    [/\bgit\s+push\b[^\n;&|]*(?:--force\b|--force-with-lease\b|\s-[a-zA-Z]*f[a-zA-Z]*(?=\s|$))/, 'Force-push is not allowed.'],
    [/\bgit\s+push\b[^\n;&|]*(?:\s\+\S|\s--delete\b|\s-d\b|\s:\S)/, 'A force refspec (+ref) or remote branch deletion is not allowed.'],
    [/\bgit\s+commit\b[^\n;&|]*--amend\b/, 'Amending commits is not allowed; make a new commit.'],
    [/\bgit\s+commit\b(?=[^\n;&|]*\s-[a-zA-Z]*n[a-zA-Z]*(?:\s|$))/, 'git commit -n skips the git hooks and is not allowed.'],
    [/\bgit\s+reset\b[^\n;&|]*--hard\b/, 'git reset --hard discards work; ask the user to do it.'],
    [/\bgit\s+clean\b/, 'git clean deletes untracked files; ask the user to do it.'],
    [/\bgit\s+(?:checkout|restore)\s+(?:--\s|\.(?:\s|$))/, 'This discards uncommitted changes; ask the user to do it.'],
    [/\bgit\s+restore\b[^\n;&|]*(?:--worktree|--source)/, 'This discards uncommitted changes; ask the user to do it.'],
    [/\bgit\s+branch\b[^\n;&|]*(?:\s-D\b|--delete\s+--force|--force\s+--delete|\s-d\s+-f\b|\s-f\s+-d\b)/, 'Force-deleting a branch is not allowed; ask the user.'],
  ];
  for (const [re, why] of DENY_GIT) if (re.test(gitCmd)) block(`Blocked: ${why}`);

  const DENY_FLAGS = [
    [/\bgit\b[^\n]*--no-verify\b/, 'Bypassing git hooks (--no-verify) is not allowed.'],
    [/\bHUSKY=0\b|\bHUSKY_SKIP_HOOKS=\S+|\bcore\.hooksPath\s*=/, 'Disabling git hooks is not allowed.'],
    [/\bnpm\s+publish\b/, 'Publishing a package is not allowed from Claude.'],
    [/\b(curl|wget|iwr|Invoke-WebRequest)\b[^|;]*\|\s*(sh|bash|zsh|iex|Invoke-Expression)\b/i, 'Piping a download into a shell is not allowed.'],
    // Unix: rm -rf, rm -fr, rm -r -f, rm --recursive --force
    [/\brm\s+(-[a-z]*r[a-z]*f|-[a-z]*f[a-z]*r|-[a-z]*r\b.*\s-[a-z]*f\b|-[a-z]*f\b.*\s-[a-z]*r\b|--recursive\b.*--force\b|--force\b.*--recursive\b)/i, 'Recursive force delete is not allowed.'],
    // PowerShell: Remove-Item and its aliases (rm, ri, del, erase, rd, rmdir) with -Recurse and -Force, in any order, abbreviated
    [/\b(?:rm|ri|del|erase|rd|rmdir|Remove-Item)\b(?=[^\n;&|]*\s-r(?:ecurse)?\b)(?=[^\n;&|]*\s-fo(?:rce)?\b)/i, 'Recursive force delete is not allowed.'],
    [/\bRemove-Item\b(?=.*-Recurse)(?=.*-Force)/i, 'Recursive force delete is not allowed.'],
    // cmd.exe: rmdir /s, rd /s, del /s
    [/\b(?:rmdir|rd|del|erase)\b[^\n;&|]*\s\/s\b/i, 'Recursive delete (cmd) is not allowed.'],
    [/\bfind\b[^\n;&|]*\s-delete\b/, 'find -delete is not allowed.'],
  ];
  for (const [re, why] of DENY_FLAGS) if (re.test(flagsOnly)) block(`Blocked: ${why}`);

  const DENY_RAW = [[/\b(DROP\s+(TABLE|DATABASE|SCHEMA)|TRUNCATE\s+TABLE?)\b/i, 'Destructive SQL is not allowed from Claude.']];
  for (const [re, why] of DENY_RAW) if (re.test(cmd)) block(`Blocked: ${why}`);

  // .env files: any command that names one is blocked unless its first word is a known consumer that does not print
  // the file (git, docker, ls ...). Checked per segment so `docker up && cat .env` is still caught.
  const ENV_TOKEN = /(?:^|[\s'"/\\=])\.env(?:\.(?!example\b)[\w.-]+)?(?=[\s'"|;&)<>]|$)/i;
  const ENV_SAFE_FIRST = /^(?:git|docker|docker-compose|ls|dir|stat|test|Test-Path|Get-ChildItem|Get-Item|Resolve-Path)$/i;
  for (const segment of cmd.split(/&&|\|\||[;|&\n]/)) {
    const words = segment.trim().replace(/^(?:\w+=\S*\s+)+/, '').split(/\s+/);
    if (ENV_TOKEN.test(segment) && !ENV_SAFE_FIRST.test(words[0] ?? '')) {
      block('Blocked: commands that touch .env files are not allowed. Use .env.example for variable names.');
    }
  }

  const secret = findSecret(cmd, [...SECRET_PATTERNS, ...LITERAL_CREDENTIAL_PATTERNS]);
  if (secret) {
    block(
      `Blocked: the command contains ${secret}. Put it in an environment variable (for example $API_TOKEN) so no secret is ever stored in a permission rule or shell history.`,
    );
  }

  // The Edit/Write tools cannot change the guardrail files (guard-edits.mjs); neither may a shell command.
  const PROTECTED = String.raw`\.claude[\\/](?:settings(?:\.[\w-]+)?\.json|hooks[\\/]|hooks\.config\.json)`;
  const WRITE_TO = new RegExp(String.raw`(?:>>?|\btee\b(?:\s+-a)?)\s*["']?\S*${PROTECTED}`, 'i');
  const WRITE_VERB = new RegExp(
    String.raw`\b(?:sed\s+-i\S*|Set-Content|Add-Content|Out-File|Clear-Content|cp|mv|rm|del|erase|Remove-Item|Copy-Item|Move-Item|git\s+(?:apply|checkout|restore))\b[^\n;&|]*${PROTECTED}`,
    'i',
  );
  const WRITE_FN = String.raw`(?:writeFile(?:Sync)?|appendFile(?:Sync)?|rmSync|unlinkSync|renameSync|copyFileSync)`;
  const WRITE_CALL = new RegExp(`${WRITE_FN}[^\\n]*${PROTECTED}|${PROTECTED}[^\\n]*${WRITE_FN}`, 'i');
  if (WRITE_TO.test(cmd) || WRITE_VERB.test(cmd) || WRITE_CALL.test(cmd)) {
    block('Blocked: this command would modify the guardrail files (.claude/settings*.json, .claude/hooks/, .claude/hooks.config.json). Describe the change you need and let the developer make it.');
  }

  const ASK = [
    [/\bgit\s+push\b/, 'Pushing publishes work; confirm.'],
    [/\bgit\s+stash\s+(?:clear|drop)\b/, 'Dropping stashes loses work; confirm.'],
    [/\bdocker\s+compose\b.*\bdown\b.*(-v\b|--volumes\b)/, 'This deletes local database volumes; confirm.'],
    [/\bDELETE\s+FROM\s+\w+\s*(?:;|["']|$)/i, 'DELETE without a WHERE clause removes every row; confirm.'],
    [/\b(?:prisma\s+migrate\s+reset|typeorm\s+schema:drop|db:reset|db:drop|dropdb)\b/i, 'This destroys the database; confirm.'],
    [/^\s*(?:printenv|env|Get-ChildItem\s+env:|gci\s+env:)\s*$/im, 'This prints environment variables, which may hold secrets; confirm.'],
  ];
  if (loadConfig(projectDir(input)).askBeforeInstall) {
    ASK.unshift([
      /\b(?:npm|pnpm)\s+(?:i|install|add)\b(?=[^\n;&|]*\s[^-\s;&|])|\byarn\s+add\b(?=[^\n;&|]*\s[^-\s;&|])|\b(?:pip3?|poetry|uv)\s+(?:install|add)\b(?=[^\n;&|]*\s[^-\s;&|])/,
      'Adding a dependency needs approval (project rule).',
    ]);
  }
  for (const [re, why] of ASK) if (re.test(gitCmd)) ask(why);
}
