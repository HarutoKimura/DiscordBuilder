/** The single abstraction over "where generated apps get served from". */
export interface DeployTarget {
  /** Make the app served on hostPort reachable and return its public URL. */
  register(projectId: string, hostPort: number): Promise<{ url: string }>;
  unregister(projectId: string): Promise<void>;
  /** Optional cleanup of all resources (e.g. tunnel processes) on shutdown. */
  shutdown?(): Promise<void>;
}

/** M1: no proxy — the "deploy" is just the localhost URL of the published container port. */
export class LocalDeployTarget implements DeployTarget {
  async register(_projectId: string, hostPort: number): Promise<{ url: string }> {
    return { url: `http://localhost:${hostPort}` };
  }

  async unregister(_projectId: string): Promise<void> {
    // Nothing to tear down locally.
  }
}
