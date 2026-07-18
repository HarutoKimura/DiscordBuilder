import { describe, expect, it } from 'vitest';
import { parseCodexEventLine } from './events.js';

describe('parseCodexEventLine rejects non-events', () => {
  it.each([
    ['empty line', ''],
    ['whitespace-only line', '   \t  '],
    ['non-JSON text', 'codex exec: warming up...'],
    ['truncated JSON', '{"type":"turn.start'],
    ['JSON string', '"thread.started"'],
    ['JSON number', '42'],
    ['JSON boolean', 'true'],
    ['JSON null', 'null'],
  ])('returns null for %s', (_name, line) => {
    expect(parseCodexEventLine(line)).toBeNull();
  });
});

// Shapes below mirror the real codex-cli 0.144.5 capture documented in events.ts.
describe('parseCodexEventLine on real event shapes', () => {
  it('parses thread.started with thread_id', () => {
    const event = parseCodexEventLine('{"type":"thread.started","thread_id":"th_123"}');
    expect(event).toMatchObject({ type: 'thread.started', threadId: 'th_123' });
    expect(event?.item).toBeUndefined();
    expect(event?.usage).toBeUndefined();
  });

  it('parses turn.started without optional fields', () => {
    const event = parseCodexEventLine('{"type":"turn.started"}');
    expect(event).toMatchObject({ type: 'turn.started' });
    expect(event?.threadId).toBeUndefined();
  });

  it('parses item.started with a command_execution item', () => {
    const line = JSON.stringify({
      type: 'item.started',
      item: { id: 'item_0', type: 'command_execution', command: '/bin/bash -lc "pnpm install"', status: 'in_progress' },
    });
    const event = parseCodexEventLine(line);
    expect(event?.type).toBe('item.started');
    expect(event?.item).toEqual({
      id: 'item_0',
      type: 'command_execution',
      command: '/bin/bash -lc "pnpm install"',
      status: 'in_progress',
    });
  });

  it('parses item.completed with a command_execution result', () => {
    const line = JSON.stringify({
      type: 'item.completed',
      item: {
        id: 'item_0',
        type: 'command_execution',
        command: 'pnpm typecheck',
        aggregated_output: 'Done in 3s',
        exit_code: 0,
        status: 'completed',
      },
    });
    const event = parseCodexEventLine(line);
    expect(event?.item?.exit_code).toBe(0);
    expect(event?.item?.aggregated_output).toBe('Done in 3s');
  });

  it('parses item.completed with a file_change item', () => {
    const line = JSON.stringify({
      type: 'item.completed',
      item: {
        id: 'item_1',
        type: 'file_change',
        changes: [
          { path: 'app/page.tsx', kind: 'update' },
          { path: 'app/actions.ts', kind: 'add' },
        ],
        status: 'completed',
      },
    });
    const event = parseCodexEventLine(line);
    expect(event?.item?.changes).toEqual([
      { path: 'app/page.tsx', kind: 'update' },
      { path: 'app/actions.ts', kind: 'add' },
    ]);
  });

  it('parses item.completed with an agent_message item', () => {
    const line = JSON.stringify({
      type: 'item.completed',
      item: { id: 'item_2', type: 'agent_message', text: 'RSVPフォームを追加しました' },
    });
    expect(parseCodexEventLine(line)?.item?.text).toBe('RSVPフォームを追加しました');
  });

  it('parses turn.completed with usage counters', () => {
    const line = JSON.stringify({
      type: 'turn.completed',
      usage: { input_tokens: 1200, cached_input_tokens: 800, output_tokens: 340 },
    });
    expect(parseCodexEventLine(line)?.usage).toEqual({
      input_tokens: 1200,
      cached_input_tokens: 800,
      output_tokens: 340,
    });
  });
});

describe('parseCodexEventLine tolerance', () => {
  it('maps a missing type to "unknown" and keeps the raw payload', () => {
    const event = parseCodexEventLine('{"foo":"bar"}');
    expect(event?.type).toBe('unknown');
    expect(event?.raw).toEqual({ foo: 'bar' });
  });

  it('keeps unknown event types and extra fields in raw', () => {
    const event = parseCodexEventLine('{"type":"session.metrics","latency_ms":42}');
    expect(event?.type).toBe('session.metrics');
    expect(event?.raw).toEqual({ type: 'session.metrics', latency_ms: 42 });
  });

  it('ignores a non-string thread_id instead of failing', () => {
    const event = parseCodexEventLine('{"type":"thread.started","thread_id":7}');
    expect(event?.type).toBe('thread.started');
    expect(event?.threadId).toBeUndefined();
  });

  it('tolerates surrounding whitespace around a valid line', () => {
    const event = parseCodexEventLine('  {"type":"turn.started"}  \n');
    expect(event?.type).toBe('turn.started');
  });
});
