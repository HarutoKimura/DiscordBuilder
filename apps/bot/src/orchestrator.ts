/**
 * Build queue: serial per project, parallel across projects.
 * Each project's jobs are chained; a failed job does not block the next one.
 */
export class BuildQueue {
  private readonly chains = new Map<string, Promise<void>>();

  enqueue(projectId: string, job: () => Promise<void>): Promise<void> {
    const prev = this.chains.get(projectId) ?? Promise.resolve();
    const next = prev.then(job, job);
    this.chains.set(
      projectId,
      next.catch(() => {}),
    );
    return next;
  }
}
