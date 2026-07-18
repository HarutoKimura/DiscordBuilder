import { LocalDeployTarget, type DeployTarget } from './target.js';
import { CloudflaredDeployTarget } from './cloudflared.js';

export type { DeployTarget } from './target.js';
export { LocalDeployTarget } from './target.js';
export { CloudflaredDeployTarget } from './cloudflared.js';

export type DeployMode = 'local' | 'cloudflared';

/** Build the deploy target for the configured mode. One instance is shared across
 * builds so per-project tunnels persist (see CloudflaredDeployTarget). */
export function createDeployTarget(mode: DeployMode): DeployTarget {
  return mode === 'cloudflared' ? new CloudflaredDeployTarget() : new LocalDeployTarget();
}
