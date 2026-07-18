import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

/**
 * Walks up from `start` (default: cwd) to the directory containing
 * pnpm-workspace.yaml. Lets apps resolve templates/ and var/ regardless of
 * which package they were launched from.
 */
export function findRepoRoot(start: string = process.cwd()): string {
  let dir = start;
  for (;;) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) {
      throw new Error(`Repo root not found walking up from ${start} (missing pnpm-workspace.yaml)`);
    }
    dir = parent;
  }
}
