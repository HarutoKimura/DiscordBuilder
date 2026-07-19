import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Message } from 'discord.js';
import type { CodexEvent } from '@discordbuilder/sandbox';
import { ProgressReporter } from './progress.js';

const EDIT_INTERVAL_MS = 2500;

function createReporter() {
  const edit = vi.fn(async (_text: string) => undefined);
  // Only .edit is exercised by ProgressReporter; the rest of Message is unused.
  const reporter = new ProgressReporter({ edit } as unknown as Message);
  const lastEdit = (): string => edit.mock.calls.at(-1)?.[0] as string;
  return { reporter, edit, lastEdit };
}

function event(partial: Omit<CodexEvent, 'raw'>): CodexEvent {
  return { ...partial, raw: {} };
}

beforeEach(() => {
  // Installed before construction so both setInterval and Date.now (elapsed
  // time display) are deterministic.
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('ProgressReporter', () => {
  it('renders an initial status line on the first tick', async () => {
    const { edit, lastEdit } = createReporter();
    await vi.advanceTimersByTimeAsync(EDIT_INTERVAL_MS);
    expect(edit).toHaveBeenCalledTimes(1);
    expect(lastEdit()).toContain('🏗️');
    expect(lastEdit()).toContain('(2s elapsed)');
    expect(lastEdit()).toContain('0 command(s) run / 0 file(s) changed');
  });

  it('skips edits while nothing changed', async () => {
    const { edit } = createReporter();
    await vi.advanceTimersByTimeAsync(EDIT_INTERVAL_MS);
    await vi.advanceTimersByTimeAsync(EDIT_INTERVAL_MS * 3);
    expect(edit).toHaveBeenCalledTimes(1);
  });

  it('switches to minute format after 60 seconds', async () => {
    const { reporter, lastEdit } = createReporter();
    await vi.advanceTimersByTimeAsync(60_000);
    reporter.onLog('installing deps');
    await vi.advanceTimersByTimeAsync(EDIT_INTERVAL_MS);
    expect(lastEdit()).toContain('(1m 2s elapsed)');
  });

  it('shows a started command with the shell wrapper stripped', async () => {
    const { reporter, lastEdit } = createReporter();
    reporter.onEvent(event({
      type: 'item.started',
      item: { type: 'command_execution', command: '/bin/bash -lc "pnpm install"' },
    }));
    await vi.advanceTimersByTimeAsync(EDIT_INTERVAL_MS);
    expect(lastEdit()).toContain('▶️ `pnpm install`');
  });

  it('counts a completed command and clears the running one', async () => {
    const { reporter, lastEdit } = createReporter();
    reporter.onEvent(event({
      type: 'item.started',
      item: { type: 'command_execution', command: 'pnpm build' },
    }));
    reporter.onEvent(event({
      type: 'item.completed',
      item: { type: 'command_execution', command: 'pnpm build', exit_code: 0 },
    }));
    await vi.advanceTimersByTimeAsync(EDIT_INTERVAL_MS);
    expect(lastEdit()).toContain('1 command(s) run');
    expect(lastEdit()).not.toContain('▶️');
  });

  it('counts file changes per entry, defaulting to 1 without a change list', async () => {
    const { reporter, lastEdit } = createReporter();
    reporter.onEvent(event({
      type: 'item.completed',
      item: {
        type: 'file_change',
        changes: [
          { path: 'app/page.tsx', kind: 'update' },
          { path: 'app/actions.ts', kind: 'add' },
        ],
      },
    }));
    reporter.onEvent(event({ type: 'item.completed', item: { type: 'file_change' } }));
    await vi.advanceTimersByTimeAsync(EDIT_INTERVAL_MS);
    expect(lastEdit()).toContain('3 file(s) changed');
  });

  it('renders the last agent message with whitespace collapsed and truncated', async () => {
    const { reporter, lastEdit } = createReporter();
    reporter.onEvent(event({
      type: 'item.completed',
      item: { type: 'agent_message', text: `まず\n  スキーマを   作成します ${'a'.repeat(400)}` },
    }));
    await vi.advanceTimersByTimeAsync(EDIT_INTERVAL_MS);
    expect(lastEdit()).toContain('💬 まず スキーマを 作成します');
    expect(lastEdit()).toContain('…');
    expect(lastEdit()).not.toContain('a'.repeat(350));
  });

  it('shows operator pipeline steps from onLog', async () => {
    const { reporter, lastEdit } = createReporter();
    reporter.onLog('コンテナを作成中…');
    await vi.advanceTimersByTimeAsync(EDIT_INTERVAL_MS);
    expect(lastEdit()).toContain('⚙️ コンテナを作成中…');
  });

  it('ignores events that carry no progress information', async () => {
    const { reporter, edit } = createReporter();
    await vi.advanceTimersByTimeAsync(EDIT_INTERVAL_MS);
    reporter.onEvent(event({ type: 'turn.started' }));
    reporter.onEvent(event({ type: 'thread.started', threadId: 'th_1' }));
    await vi.advanceTimersByTimeAsync(EDIT_INTERVAL_MS);
    expect(edit).toHaveBeenCalledTimes(1);
  });

  it('finish() posts the final text and stops further edits', async () => {
    const { reporter, edit, lastEdit } = createReporter();
    await reporter.finish('✅ 完成しました');
    expect(lastEdit()).toBe('✅ 完成しました');
    const editsAfterFinish = edit.mock.calls.length;
    reporter.onEvent(event({
      type: 'item.completed',
      item: { type: 'command_execution' },
    }));
    await vi.advanceTimersByTimeAsync(EDIT_INTERVAL_MS * 4);
    expect(edit).toHaveBeenCalledTimes(editsAfterFinish);
  });

  it('caps the final text at 1900 characters', async () => {
    const { reporter, lastEdit } = createReporter();
    await reporter.finish('x'.repeat(2500));
    expect(lastEdit()).toHaveLength(1900);
  });

  it('keeps reporting after a failed edit (deleted status message)', async () => {
    const { reporter, edit, lastEdit } = createReporter();
    edit.mockRejectedValueOnce(new Error('Unknown Message'));
    await vi.advanceTimersByTimeAsync(EDIT_INTERVAL_MS);
    expect(edit).toHaveBeenCalledTimes(1);
    reporter.onLog('still going');
    await vi.advanceTimersByTimeAsync(EDIT_INTERVAL_MS);
    expect(edit).toHaveBeenCalledTimes(2);
    expect(lastEdit()).toContain('still going');
  });
});
