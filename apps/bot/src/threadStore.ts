// Discord thread ↔ project mapping, persisted at var/bot/threads.json.
// M2 writes the mapping; M3 reads it to turn thread replies into edit tasks.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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
    return JSON.parse(readFileSync(this.path, 'utf8')) as Record<string, ThreadBinding>;
  }

  get(threadId: string): ThreadBinding | undefined {
    return this.readAll()[threadId];
  }

  set(threadId: string, binding: ThreadBinding): void {
    const all = this.readAll();
    all[threadId] = binding;
    writeFileSync(this.path, JSON.stringify(all, null, 2) + '\n');
  }
}
