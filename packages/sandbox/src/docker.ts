// Thin wrapper over the `docker` CLI (chosen over dockerode: fewer deps, easier
// to debug by copy-pasting commands).
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

export interface DockerResult {
  code: number;
  stdout: string;
  stderr: string;
}

/** Run `docker <args>` and collect output. Rejects only on spawn failure, not non-zero exit. */
export function docker(args: string[]): Promise<DockerResult> {
  return new Promise((resolve, reject) => {
    const child = spawn('docker', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d: Buffer) => (stdout += d.toString()));
    child.stderr.on('data', (d: Buffer) => (stderr += d.toString()));
    child.on('error', reject);
    child.on('close', (code) => resolve({ code: code ?? -1, stdout, stderr }));
  });
}

/** Run `docker <args>`, throwing (with stderr in the message) on non-zero exit. */
export async function dockerOk(args: string[]): Promise<DockerResult> {
  const result = await docker(args);
  if (result.code !== 0) {
    throw new Error(`docker ${args[0]} failed (exit ${result.code}): ${result.stderr.trim() || result.stdout.trim()}`);
  }
  return result;
}

export interface StreamOptions {
  /** Kill the process after this many ms. */
  timeoutMs?: number;
  onStderrLine?: (line: string) => void;
}

/**
 * Run `docker <args>` streaming stdout line-by-line (used for `codex exec --json`).
 * Resolves with the exit code; -2 means the timeout fired and the process was killed.
 */
export function dockerStream(
  args: string[],
  onLine: (line: string) => void,
  opts: StreamOptions = {},
): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn('docker', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let timedOut = false;
    const timer = opts.timeoutMs
      ? setTimeout(() => {
          timedOut = true;
          child.kill('SIGKILL');
        }, opts.timeoutMs)
      : undefined;

    const out = createInterface({ input: child.stdout });
    out.on('line', onLine);
    const err = createInterface({ input: child.stderr });
    err.on('line', (line) => opts.onStderrLine?.(line));

    child.on('error', (e) => {
      if (timer) clearTimeout(timer);
      reject(e);
    });
    child.on('close', (code) => {
      if (timer) clearTimeout(timer);
      resolve(timedOut ? -2 : (code ?? -1));
    });
  });
}

/** True if a container with this exact name exists (running or not). */
export async function containerExists(name: string): Promise<boolean> {
  const result = await docker(['inspect', '--format', '{{.State.Running}}', name]);
  return result.code === 0;
}

export async function containerRunning(name: string): Promise<boolean> {
  const result = await docker(['inspect', '--format', '{{.State.Running}}', name]);
  return result.code === 0 && result.stdout.trim() === 'true';
}
