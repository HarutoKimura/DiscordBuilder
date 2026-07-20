import { describe, expect, it } from 'vitest';
import { buildCodexDockerInvocation } from './localDockerSandbox.js';

describe('buildCodexDockerInvocation', () => {
  const codexArgs = ['exec', '--json', '-m', 'gpt-test', 'prompt with $HELL and spaces'];

  it('uses the container login directly in chatgpt mode', () => {
    const invocation = buildCodexDockerInvocation('dbuilder-test', codexArgs, 'chatgpt');

    expect(invocation).toEqual({
      command: ['exec', '-w', '/workspace/app', 'dbuilder-test', 'codex', ...codexArgs],
    });
  });

  it('puts an API key only on stdin and preserves every Codex argument', () => {
    const key = 'sk-secret-that-must-not-reach-argv';
    const invocation = buildCodexDockerInvocation('dbuilder-test', codexArgs, 'api-key', key);

    expect(invocation.stdin).toBe(`${key}\n`);
    expect(invocation.command).not.toContain(key);
    expect(invocation.command.join('\n')).not.toContain(key);
    expect(invocation.command.slice(-codexArgs.length)).toEqual(codexArgs);
    expect(invocation.command).toContain('-i');
    expect(invocation.command.join('\n')).toContain('CODEX_API_KEY');
  });

  it('rejects API-key mode without a key', () => {
    expect(() => buildCodexDockerInvocation('dbuilder-test', codexArgs, 'api-key')).toThrow(
      'CODEX_AUTH_MODE=api-key requires OPENAI_API_KEY',
    );
  });
});
