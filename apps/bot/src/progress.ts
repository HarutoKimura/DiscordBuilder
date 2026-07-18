// Renders the codex event stream into ONE Discord status message, edited in
// place. Edits are throttled to respect Discord rate limits.
import type { Message } from 'discord.js';
import type { CodexEvent } from '@discordbuilder/sandbox';

const EDIT_INTERVAL_MS = 2500;
const MAX_AGENT_TEXT = 350;
const MAX_COMMAND_TEXT = 120;

function truncate(text: string, max: number): string {
  const oneLine = text.replace(/\s+/g, ' ').trim();
  return oneLine.length <= max ? oneLine : oneLine.slice(0, max - 1) + '…';
}

function elapsed(startedAt: number): string {
  const seconds = Math.floor((Date.now() - startedAt) / 1000);
  return seconds < 60 ? `${seconds}秒` : `${Math.floor(seconds / 60)}分${seconds % 60}秒`;
}

/** Strip codex's shell wrapper for readable progress lines. */
function prettyCommand(command: string): string {
  const match = command.match(/^\S+\/(?:bash|zsh|sh) -lc\s+(.*)$/s);
  if (!match) return command;
  let inner = match[1]!.trim();
  const quote = inner[0];
  if ((quote === '"' || quote === "'") && inner.endsWith(quote)) inner = inner.slice(1, -1);
  return inner;
}

export class ProgressReporter {
  private commands = 0;
  private files = 0;
  private lastAgentText = '';
  private currentCommand = '';
  private setupNote = '';
  private readonly startedAt = Date.now();
  private dirty = true;
  private finished = false;
  private readonly timer: NodeJS.Timeout;

  constructor(private readonly message: Message) {
    this.timer = setInterval(() => {
      void this.flush();
    }, EDIT_INTERVAL_MS);
  }

  /** Operator-level pipeline steps (container create, deps install, …). */
  onLog(text: string): void {
    this.setupNote = truncate(text, MAX_COMMAND_TEXT);
    this.dirty = true;
  }

  onEvent(event: CodexEvent): void {
    const item = event.item;
    if (event.type === 'item.started' && item?.type === 'command_execution' && item.command) {
      this.currentCommand = truncate(prettyCommand(item.command), MAX_COMMAND_TEXT);
      this.dirty = true;
    } else if (event.type === 'item.completed') {
      if (item?.type === 'command_execution') {
        this.commands += 1;
        this.currentCommand = '';
      } else if (item?.type === 'file_change') {
        this.files += item.changes?.length ?? 1;
      } else if (item?.type === 'agent_message' && item.text) {
        this.lastAgentText = truncate(item.text, MAX_AGENT_TEXT);
      }
      this.dirty = true;
    }
  }

  private render(): string {
    const lines = [`🏗️ **ビルド中…**(${elapsed(this.startedAt)}経過)`];
    if (this.setupNote) lines.push(`⚙️ ${this.setupNote}`);
    lines.push(`📊 コマンド実行 ${this.commands} 回 / ファイル変更 ${this.files} 件`);
    if (this.lastAgentText) lines.push(`💬 ${this.lastAgentText}`);
    if (this.currentCommand) lines.push(`▶️ \`${this.currentCommand}\``);
    return lines.join('\n').slice(0, 1900);
  }

  private async flush(): Promise<void> {
    if (!this.dirty || this.finished) return;
    this.dirty = false;
    try {
      await this.message.edit(this.render());
    } catch {
      // The status message may have been deleted; progress display is best-effort.
    }
  }

  /** Stop editing. The final result is posted as a separate message by the runner. */
  async finish(finalText: string): Promise<void> {
    this.finished = true;
    clearInterval(this.timer);
    try {
      await this.message.edit(finalText.slice(0, 1900));
    } catch {
      // best-effort
    }
  }
}
