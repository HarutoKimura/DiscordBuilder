import type { BuildRequest, BuildResultFile } from '@discordbuilder/shared';

export interface SandboxHandle {
  projectId: string;
  containerName: string;
  /** Host port the app's server inside the container is published on. */
  hostPort: number;
}

/** One parsed line of the `codex exec --json` JSONL stream. Shape is codex-version-dependent. */
export interface CodexEvent {
  raw: unknown;
  type?: string;
}

export interface SandboxRunner {
  /** Create (or reuse) the project's container seeded with a fresh copy of the app template. */
  create(projectId: string): Promise<SandboxHandle>;
  /**
   * Run `codex exec` for the given build request, streaming events to `onEvent`.
   * Resolves with the parsed BUILD_RESULT.json written by the agent.
   */
  runBuild(
    handle: SandboxHandle,
    request: BuildRequest,
    onEvent: (event: CodexEvent) => void,
  ): Promise<BuildResultFile>;
  destroy(handle: SandboxHandle): Promise<void>;
}

/**
 * Docker-backed implementation (drives the `docker` CLI; image at infra/docker).
 * Implemented at M1 — see README.md for the verified codex invocation.
 */
export class LocalDockerSandbox implements SandboxRunner {
  async create(_projectId: string): Promise<SandboxHandle> {
    throw new Error('LocalDockerSandbox.create: not implemented yet (M1)');
  }

  async runBuild(
    _handle: SandboxHandle,
    _request: BuildRequest,
    _onEvent: (event: CodexEvent) => void,
  ): Promise<BuildResultFile> {
    throw new Error('LocalDockerSandbox.runBuild: not implemented yet (M1)');
  }

  async destroy(_handle: SandboxHandle): Promise<void> {
    throw new Error('LocalDockerSandbox.destroy: not implemented yet (M1)');
  }
}
