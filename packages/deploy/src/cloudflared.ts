import { spawn, type ChildProcess } from 'node:child_process';
import { createInterface } from 'node:readline';
import type { DeployTarget } from './target.js';

interface Tunnel {
  proc: ChildProcess;
  url: string;
  hostPort: number;
}

const QUICK_TUNNEL_URL = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/i;
const STARTUP_TIMEOUT_MS = 30_000;

/**
 * Exposes each project's local container port through a Cloudflare quick tunnel
 * (`cloudflared tunnel --url http://localhost:<port>`), giving a public HTTPS URL
 * that community members and judges can open. The SQLite app keeps running in its
 * Docker container — the tunnel is only public ingress.
 *
 * Quick tunnels need no Cloudflare account but mint a NEW random hostname each run,
 * so a URL is stable only while this process (and the tunnel it spawned) stays up.
 * A named tunnel under BASE_DOMAIN would be stable; that is the production upgrade.
 */
export class CloudflaredDeployTarget implements DeployTarget {
  private readonly tunnels = new Map<string, Tunnel>();

  async register(projectId: string, hostPort: number): Promise<{ url: string }> {
    const existing = this.tunnels.get(projectId);
    // Port is stable per project, so an existing tunnel keeps working across edit rebuilds.
    if (existing && existing.hostPort === hostPort && existing.proc.exitCode === null) {
      return { url: existing.url };
    }
    if (existing) await this.unregister(projectId);

    const proc = spawn('cloudflared', ['tunnel', '--url', `http://localhost:${hostPort}`], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const url = await this.waitForUrl(proc).catch((err: unknown) => {
      proc.kill('SIGKILL');
      throw err;
    });

    this.tunnels.set(projectId, { proc, url, hostPort });
    proc.on('exit', () => {
      if (this.tunnels.get(projectId)?.proc === proc) this.tunnels.delete(projectId);
    });
    return { url };
  }

  async unregister(projectId: string): Promise<void> {
    const tunnel = this.tunnels.get(projectId);
    if (!tunnel) return;
    this.tunnels.delete(projectId);
    tunnel.proc.kill('SIGTERM');
  }

  /** Kill every tunnel — call on bot shutdown so no cloudflared processes leak. */
  async shutdown(): Promise<void> {
    for (const { proc } of this.tunnels.values()) proc.kill('SIGTERM');
    this.tunnels.clear();
  }

  private waitForUrl(proc: ChildProcess): Promise<string> {
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (fn: () => void): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        fn();
      };
      const timer = setTimeout(
        () => finish(() => reject(new Error('cloudflared did not report a tunnel URL within 30s'))),
        STARTUP_TIMEOUT_MS,
      );
      // cloudflared logs the quick-tunnel URL to stderr.
      const scan = (line: string): void => {
        const match = line.match(QUICK_TUNNEL_URL);
        if (match) finish(() => resolve(match[0]));
      };
      if (proc.stderr) createInterface({ input: proc.stderr }).on('line', scan);
      if (proc.stdout) createInterface({ input: proc.stdout }).on('line', scan);
      proc.on('error', (err) =>
        finish(() =>
          reject(
            err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT'
              ? new Error('cloudflared is not installed (brew install cloudflared) — or set DEPLOY_MODE=local')
              : err,
          ),
        ),
      );
      proc.on('exit', (code) => finish(() => reject(new Error(`cloudflared exited early (code ${code})`))));
    });
  }
}
