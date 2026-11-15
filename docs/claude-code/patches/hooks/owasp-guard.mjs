// PreToolUse (matcher: Write|Edit|MultiEdit|NotebookEdit): block or ask on high-confidence insecure code as it is written.
// This is a floor, not a scanner: a few patterns with almost no legitimate use. The security-reviewer agent and CI do the rest.
// Parameters (.claude/hooks.config.json "owaspGuard"): { enabled, skipPathRegex }.
import { ask, block, collectText, failClosed, loadConfig, projectDir, readInput, resolveFile } from './lib.mjs';

failClosed(main);

function main() {
  const input = readInput();
  const ti = input.tool_input ?? {};
  const file = resolveFile(input, ti);
  if (!file) process.exit(0);

  const cfg = loadConfig(projectDir(input)).owaspGuard;
  if (!cfg.enabled) process.exit(0);

  const isWorkflow = /\/\.github\/workflows\/[^/]+\.ya?ml$/i.test(file);
  const isDockerfile = /(^|\/)Dockerfile[^/]*$/i.test(file);
  const isCode = /\.(ts|tsx|js|jsx|mjs|cjs|py|java|kt|go|cs|rb|php)$/i.test(file);
  if (!isWorkflow && !isDockerfile && !isCode) process.exit(0);
  if (new RegExp(cfg.skipPathRegex, 'i').test(file)) process.exit(0);

  const content = collectText(ti);
  if (!content.trim()) process.exit(0);

  if (isWorkflow) {
    // Untrusted event text inside a run: script is a command-injection hole; pass it through env: instead.
    const INJECT = /\$\{\{\s*github\.(?:event\.(?:pull_request|issue|comment|review|review_comment|head_commit|commits|pages|discussion)|head_ref)[^}]*\}\}/;
    let runIndent = -1;
    for (const line of content.split(/\r?\n/)) {
      const indent = line.match(/^\s*/)[0].length;
      const m = line.match(/^\s*(?:-\s*)?run:\s*(.*)$/);
      if (m) {
        runIndent = /^[|>]/.test(m[1].trim()) ? indent : -1;
        if (m[1] && !/^[|>]/.test(m[1].trim()) && INJECT.test(m[1])) runIndent = -2;
      } else if (runIndent >= 0 && line.trim() && indent > runIndent) {
        if (INJECT.test(line)) runIndent = -2;
      } else if (line.trim() && indent <= runIndent) runIndent = -1;
      if (runIndent === -2) {
        block('Blocked by the security floor: A.03 Injection: untrusted GitHub event text is expanded inside a run: script. Assign it to an env: variable and use "$VAR" in the script.');
      }
    }
    process.exit(0);
  }
  if (isDockerfile) {
    if (/^\s*RUN\b[^\n]*\b(?:curl|wget)\b[^|\n]*\|\s*(?:ba)?sh\b/im.test(content)) ask('Security floor: A.08 Integrity: a build step pipes a download into a shell. Pin the version and verify a checksum instead.');
    process.exit(0);
  }

  // Block: no legitimate production use, or a well-known critical flaw.
  const BLOCK = [
    [/\beval\s*\(|\(\s*0\s*,\s*eval\s*\)|\bnew\s+Function\s*\(/, 'A.03 Injection: eval or new Function executes arbitrary code. Use a parser or a lookup table.'],
    [/rejectUnauthorized\s*:\s*false|NODE_TLS_REJECT_UNAUTHORIZED\s*=\s*['"]?0|\bverify\s*=\s*False\b|InsecureSkipVerify\s*:\s*true/, 'A.02 Cryptographic failure: TLS certificate verification must stay on.'],
    [/algorithms?\s*:\s*\[\s*['"]none['"]|ignoreExpiration\s*:\s*true|verify_exp['"]?\s*:\s*False/i, 'A.07 Authentication failure: JWT must be verified with a real algorithm and expiry checked.'],
    [/\.(query|execute|raw|queryRaw|\$queryRawUnsafe)\s*\(\s*`[^`]*\$\{/, 'A.03 SQL injection: a template literal with interpolation is passed to a query call. Use bound parameters.'],
    [/\.(query|execute|raw)\s*\(\s*(['"])[^'"\n]*\2\s*\+/, 'A.03 SQL injection: a query is built by string concatenation. Use bound parameters.'],
    [/\b(exec|execSync|spawn|spawnSync)\s*\(\s*(`[^`]*\$\{|['"][^'"\n]*['"]\s*\+)/, 'A.03 Command injection: a shell command is built from a variable. Pass an argument array without a shell.'],
    [/\b(os\.system|subprocess\.(call|run|Popen))\s*\([^)]*(f['"]|%\s|\.format\()[^)]*shell\s*=\s*True/, 'A.03 Command injection: shell=True with a formatted string.'],
    [/\byaml\.(?:unsafe_load|load)\s*\((?![^)]*(?:Safe|CSafe)Loader)/, 'A.08 Unsafe deserialization: yaml.load without SafeLoader executes arbitrary objects. Use yaml.safe_load.'],
  ];
  for (const [re, why] of BLOCK) if (re.test(content)) block(`Blocked by the security floor: ${why} If this is a deliberate, reviewed exception, ask the developer to make this edit.`);

  // Ask: usually wrong, sometimes legitimate. A person decides.
  const ASK = [
    [/dangerouslySetInnerHTML|\.innerHTML\s*=|\binsertAdjacentHTML\s*\(/, 'A.03 XSS: raw HTML is written to the page. Confirm the value is a constant or sanitized.'],
    [/createHash\s*\(\s*['"](md5|sha1)['"]\s*\)|hashlib\.(md5|sha1)\s*\(/, 'A.02 Weak hash. Confirm it is not used for passwords, tokens or integrity of secrets.'],
    [/origin\s*:\s*['"]\*['"]|Access-Control-Allow-Origin['"]?\s*,\s*['"]\*['"]/, 'A.05 Misconfiguration: wildcard CORS. Confirm no credentials or private data are served.'],
    [/origin\s*:\s*true\b[^}]*credentials\s*:\s*true|credentials\s*:\s*true\b[^}]*origin\s*:\s*true\b/, 'A.05 Misconfiguration: CORS reflects any origin and allows credentials.'],
    [/(httpOnly|secure)\s*:\s*false/, 'A.05 Misconfiguration: a cookie flag is switched off.'],
    [/(console\.(log|info|debug)|logger\.(log|info|debug|warn|error)|print)\s*\([^)\n]*(password|passwd|secret|token|authorization|api[_-]?key)/i, 'A.09 Logging: a secret-looking value may be logged. Redact it.'],
    [/\b(password|passwd|secret|api[_-]?key|token)\s*[:=]\s*['"][^'"\s$%{<]{8,}['"]/i, 'A.02 A literal credential in source. Use configuration or a secret store.'],
    [/\b(?:token|secret|session|nonce|otp|password|api_?key)\w*\s*[:=][^;\n]*\bMath\.random\s*\(/i, 'A.02 Weak randomness: Math.random is predictable. Use crypto.randomBytes / crypto.randomUUID for tokens, sessions and secrets.'],
    [/\bbcrypt\w*\.(?:hash|hashSync)\s*\([^,()]+,\s*[0-9]\s*\)/, 'A.02 Weak password hashing: bcrypt cost below 10. Use cost 12 or higher, or Argon2id.'],
    [/\bset(?:Timeout|Interval)\s*\(\s*['"`]/, 'A.03 Injection: a string is passed to setTimeout/setInterval and evaluated as code. Pass a function.'],
    [/\b(?:readFile|readFileSync|createReadStream|sendFile|writeFile|writeFileSync|unlink|unlinkSync)\s*\(\s*(?:req|request|ctx\.request)\.(?:query|body|params)/, 'A.01 Path traversal: a file path comes straight from the request. Resolve against a base directory and verify the result stays inside it.'],
    [/\b(?:fetch|axios(?:\.\w+)?|got|http\.get|https\.get|request)\s*\(\s*(?:req|request|ctx\.request)\.(?:query|body|params)/, 'A.10 SSRF: a URL comes straight from the request. Allowlist hosts and block private ranges.'],
    [/\bpickle\.loads?\s*\(/, 'A.08 Unsafe deserialization: pickle can execute code. Confirm the data is trusted and never user-supplied.'],
  ];
  const hit = ASK.find(([re]) => re.test(content));
  if (hit) ask(`Security floor: ${hit[1]}`);
}
