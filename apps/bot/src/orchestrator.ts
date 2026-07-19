/**
 * Build queue: serial per project, parallel across projects, with a global
 * concurrency cap so a burst of /build commands cannot saturate the host
 * (each build = container + pnpm install + codex + dev server).
 */
export class BuildQueue {
  private readonly chains = new Map<string, Promise<void>>();
  private active = 0;
  private readonly waiters: Array<() => void> = [];

  constructor(private readonly maxConcurrent = 2) {}

  /** True when a newly enqueued job would have to wait for a free slot. */
  get busy(): boolean {
    return this.active >= this.maxConcurrent || this.waiters.length > 0;
  }

  private async acquire(): Promise<void> {
    if (this.active < this.maxConcurrent) {
      this.active += 1;
      return;
    }
    await new Promise<void>((resolve) => this.waiters.push(resolve));
    this.active += 1;
  }

  private release(): void {
    this.active -= 1;
    this.waiters.shift()?.();
  }

  /** Wait until nothing is active or queued, or until timeoutMs. True = drained. */
  async drain(timeoutMs: number): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (this.active > 0 || this.waiters.length > 0 || this.chains.size > 0) {
      if (Date.now() >= deadline) return false;
      await new Promise((r) => setTimeout(r, 250));
    }
    return true;
  }

  enqueue(projectId: string, job: () => Promise<void>): Promise<void> {
    const run = async (): Promise<void> => {
      await this.acquire();
      try {
        await job();
      } finally {
        this.release();
      }
    };
    const prev = this.chains.get(projectId) ?? Promise.resolve();
    const next = prev.then(run, run);
    const tail = next.catch(() => {});
    this.chains.set(projectId, tail);
    void tail.finally(() => {
      // Evict settled tails so the map does not grow forever.
      if (this.chains.get(projectId) === tail) this.chains.delete(projectId);
    });
    return next;
  }
}
