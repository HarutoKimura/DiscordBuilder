// Discord thread ↔ project mapping, persisted at var/bot/threads.json.
// M2 writes the mapping; M3 reads it to turn thread replies into edit tasks.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export interface ThreadBinding {
  projectId: string;
  channelId: string;
  guildId: string;
  createdAt: string;
}

export class ThreadStore {
  private readonly path: string;

  constructor(repoRoot: string) {
    const dir = join(repoRoot, 'var', 'bot');
    mkdirSync(dir, { recursive: true });
    this.path = join(dir, 'threads.json');
  }

  private readAll(): Record<string, ThreadBinding> {
    if (!existsSync(this.path)) return {};
    try {
      return JSON.parse(readFileSync(this.path, 'utf8')) as Record<string, ThreadBinding>;
    } catch (err) {
      // A corrupt store must not brick /build forever; losing old bindings is
      // the lesser evil. (Writes below are atomic to make this rare.)
      console.error(`[bot] ${this.path} is corrupt, starting fresh:`, err instanceof Error ? err.message : err);
      return {};
    }
  }

  get(threadId: string): ThreadBinding | undefined {
    return this.readAll()[threadId];
  }

  set(threadId: string, binding: ThreadBinding): void {
    const all = this.readAll();
    all[threadId] = binding;
    const tmp = this.path + '.tmp';
    writeFileSync(tmp, JSON.stringify(all, null, 2) + '\n');
    renameSync(tmp, this.path);
  }
}
