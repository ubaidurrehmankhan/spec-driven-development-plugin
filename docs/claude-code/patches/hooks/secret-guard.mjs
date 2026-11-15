// UserPromptSubmit: refuse prompts that contain credentials, so they never reach the model or the transcript.
import { LITERAL_CREDENTIAL_PATTERNS, SECRET_PATTERNS, block, findSecret, readInput } from './lib.mjs';

const input = readInput();
const prompt = String(input.prompt ?? '');
const secret = findSecret(prompt, [...SECRET_PATTERNS, ...LITERAL_CREDENTIAL_PATTERNS]);
if (secret) {
  block(
    `Prompt not sent: it contains ${secret}. Remove it and refer to it by environment variable name instead. ` +
      'If it is a real credential, rotate it.',
  );
}
