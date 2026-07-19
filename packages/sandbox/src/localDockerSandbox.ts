import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { BuildRequest, BuildResultFile, CodexAuthMode } from '@discordbuilder/shared';
import { containerExists, containerRunning, docker, dockerOk, dockerStream } from './docker.js';
import { parseCodexEventLine, type CodexEvent } from './events.js';
import { ProjectStore } from './projects.js';

export interface SandboxHandle {
  projectId: string;
  containerName: string;
  /** Host port the app's server inside the container is published on. */
  hostPort: number;
  /** Host path of the bind-mounted project working copy. */
  appDir: string;
}

export interface SandboxRunner {
  create(projectId: string): Promise<SandboxHandle>;
  runBuild(
    handle: SandboxHandle,
    request: BuildRequest,
    onEvent: (event: CodexEvent) => void,
  ): Promise<BuildResultFile>;
  destroy(handle: SandboxHandle): Promise<void>;
}

export interface LocalDockerSandboxOptions {
  /** Repo root (locates templates/app-template and var/). */
  repoRoot: string;
  codexModel: string;
  codexAuthMode: CodexAuthMode;
  /** Required when codexAuthMode === 'api-key'. */
  openaiApiKey?: string;
  /** Host codex home holding auth.json for 'chatgpt' mode. Default: ~/.codex */
  codexHome?: string;
  image?: string;
  /** Hard cap for one codex run. */
  buildTimeoutMs?: number;
  /** Progress messages for the operator (CLI stdout / orchestrator logs). */
  onLog?: (message: string) => void;
}

const CONTAINER_APP_DIR = '/workspace/app';
const CONTAINER_PORT = 3000;
const DEFAULT_IMAGE = 'discordbuilder-sandbox';
const DEFAULT_BUILD_TIMEOUT_MS = 25 * 60 * 1000;

export class LocalDockerSandbox implements SandboxRunner {
  private readonly opts: LocalDockerSandboxOptions;
  private readonly store: ProjectStore;
  private readonly templateDir: string;

  constructor(opts: LocalDockerSandboxOptions) {
    this.opts = opts;
    this.store = new ProjectStore(join(opts.repoRoot, 'var'));
    this.templateDir = join(opts.repoRoot, 'templates', 'app-template');
    if (opts.codexAuthMode === 'api-key' && !opts.openaiApiKey) {
      throw new Error('CODEX_AUTH_MODE=api-key requires OPENAI_API_KEY');
    }
  }

  private log(message: string): void {
    this.opts.onLog?.(message);
  }

  async create(projectId: string): Promise<SandboxHandle> {
    if (!/^[a-z0-9-]+$/.test(projectId)) {
      throw new Error(`Invalid project id (use lowercase letters, digits, hyphens): ${projectId}`);
    }
    const record = this.store.ensureProject(projectId);
    const appDir = this.store.appDir(projectId);
    const { created } = this.store.materializeTemplate(projectId, this.templateDir);
    if (created) this.log(`template copied to ${appDir}`);

    const name = record.containerName;
    if (!(await containerRunning(name))) {
      if (await containerExists(name)) {
        this.log(`starting existing container ${name}`);
        await dockerOk(['start', name]);
      } else {
        this.log(`creating container ${name} (host port ${record.hostPort})`);
        const args = [
          'run', '-d', '--name', name,
          '-p', `${record.hostPort}:${CONTAINER_PORT}`,
          '-v', `${appDir}:${CONTAINER_APP_DIR}`,
          // node_modules/.next live in named volumes: fast Linux-native FS, and the
          // macOS bind mount never sees platform-specific binaries.
          '-v', `dbuilder-nm-${projectId}:${CONTAINER_APP_DIR}/node_modules`,
          '-v', `dbuilder-next-${projectId}:${CONTAINER_APP_DIR}/.next`,
          '-v', 'dbuilder-pnpm-store:/pnpm-store',
          '-e', 'npm_config_store_dir=/pnpm-store',
        ];
        if (this.opts.codexAuthMode === 'api-key') {
          args.push('-e', `OPENAI_API_KEY=${this.opts.openaiApiKey}`);
        }
        args.push(this.opts.image ?? DEFAULT_IMAGE, 'sleep', 'infinity');
        await dockerOk(args);
      }
    }

    await this.injectAuth(name);
    await this.ensureDependencies(name);
    return { projectId, containerName: name, hostPort: record.hostPort, appDir };
  }

  private async injectAuth(containerName: string): Promise<void> {
    if (this.opts.codexAuthMode === 'chatgpt') {
      const authPath = join(this.opts.codexHome ?? join(homedir(), '.codex'), 'auth.json');
      if (!existsSync(authPath)) {
        throw new Error(`codex auth file not found at ${authPath} — run \`codex login\` on the host, or switch CODEX_AUTH_MODE=api-key`);
      }
      await dockerOk(['exec', containerName, 'mkdir', '-p', '/root/.codex']);
      await dockerOk(['cp', authPath, `${containerName}:/root/.codex/auth.json`]);
      this.log('codex auth injected (chatgpt subscription mode)');
    } else {
      const result = await docker([
        'exec', containerName, 'sh', '-lc',
        'printenv OPENAI_API_KEY | codex login --with-api-key',
      ]);
      if (result.code !== 0) {
        throw new Error(`codex login --with-api-key failed: ${result.stderr.trim()}`);
      }
      this.log('codex auth injected (api-key mode)');
    }
  }

  private async ensureDependencies(containerName: string): Promise<void> {
    const probe = await docker(['exec', containerName, 'test', '-d', `${CONTAINER_APP_DIR}/node_modules/next`]);
    if (probe.code === 0) return;
    this.log('installing template dependencies in container (first run)…');
    await dockerOk(['exec', '-w', CONTAINER_APP_DIR, containerName, 'pnpm', 'install', '--frozen-lockfile']);
    this.log('dependencies installed');
  }

  async runBuild(
    handle: SandboxHandle,
    request: BuildRequest,
    onEvent: (event: CodexEvent) => void,
  ): Promise<BuildResultFile> {
    const buildNo = this.store.nextBuildNumber(handle.projectId);
    const logsDir = this.store.logsDir(handle.projectId);
    mkdirSync(logsDir, { recursive: true });
    const logPath = join(logsDir, `build-${buildNo}.jsonl`);

    // Never let a stale result from a previous build masquerade as this one's.
    rmSync(join(handle.appDir, 'BUILD_RESULT.json'), { force: true });

    const prompt = composeBuildPrompt(request);
    const stderrTail: string[] = [];
    this.log(`codex exec starting (build #${buildNo}, model ${this.opts.codexModel})`);
    const exitCode = await dockerStream(
      [
        'exec', '-w', CONTAINER_APP_DIR, handle.containerName,
        'codex', 'exec',
        '--json', '--ephemeral', '--skip-git-repo-check',
        '-m', this.opts.codexModel,
        // The Docker container is the external sandbox; codex's own sandbox is redundant here.
        '--dangerously-bypass-approvals-and-sandbox',
        '-o', '/workspace/last-message.txt',
        prompt,
      ],
      (line) => {
        appendFileSync(logPath, line + '\n');
        const event = parseCodexEventLine(line);
        if (event) onEvent(event);
      },
      {
        timeoutMs: this.opts.buildTimeoutMs ?? DEFAULT_BUILD_TIMEOUT_MS,
        onStderrLine: (line) => {
          stderrTail.push(line);
          if (stderrTail.length > 20) stderrTail.shift();
        },
      },
    );
    this.log(`codex exec finished (exit ${exitCode}), events logged to ${logPath}`);

    const result = this.readBuildResult(handle, exitCode, stderrTail);
    // A slow dev-server boot must not discard the build: the result above is
    // already Codex's real output, and the caller destroys the project when
    // this method rejects. Degrade to a user-visible note instead.
    try {
      await this.ensureServer(handle);
    } catch (err) {
      this.log(`dev server probe failed: ${err instanceof Error ? err.message : String(err)}`);
      if (result.status !== 'failed') {
        result.notes.push(
          'プレビューサーバーの起動確認がタイムアウトしました。URLがすぐ開かない場合は、少し待ってから再読み込みしてください。',
        );
      }
    }
    return result;
  }

  private readBuildResult(handle: SandboxHandle, exitCode: number, stderrTail: string[]): BuildResultFile {
    const resultPath = join(handle.appDir, 'BUILD_RESULT.json');
    if (existsSync(resultPath)) {
      try {
        // Agent-authored file — validate every field, trust nothing.
        const parsed = JSON.parse(readFileSync(resultPath, 'utf8')) as Partial<BuildResultFile>;
        const strings = (value: unknown): string[] =>
          Array.isArray(value) ? value.filter((x): x is string => typeof x === 'string') : [];
        return {
          status:
            parsed.status === 'success' || parsed.status === 'partial' || parsed.status === 'failed'
              ? parsed.status
              : 'partial',
          summary:
            typeof parsed.summary === 'string' && parsed.summary.trim() ? parsed.summary : '(no summary provided)',
          changes: strings(parsed.changes),
          screenshots: strings(parsed.screenshots),
          notes: strings(parsed.notes),
          dataReset: parsed.dataReset === true,
          attempts: typeof parsed.attempts === 'number' ? parsed.attempts : 1,
        };
      } catch (err) {
        return synthesizedFailure(`BUILD_RESULT.json is not valid JSON: ${String(err)}`);
      }
    }
    const reason = exitCode === -2
      ? 'the build timed out'
      : exitCode !== 0
        ? `codex exec exited with code ${exitCode}: ${stderrTail.slice(-3).join(' / ')}`
        : 'the agent finished without writing BUILD_RESULT.json';
    return synthesizedFailure(reason);
  }

  /** Make sure the app's dev server is up and reachable through the published port. */
  private async ensureServer(handle: SandboxHandle): Promise<void> {
    if (await this.probe(handle.hostPort)) return;
    this.log('starting dev server in container');
    await dockerOk([
      'exec', '-d', handle.containerName, 'sh', '-c',
      `cd ${CONTAINER_APP_DIR} && exec pnpm dev > /workspace/dev.log 2>&1`,
    ]);
    const deadline = Date.now() + 90_000;
    while (Date.now() < deadline) {
      if (await this.probe(handle.hostPort)) return;
      await new Promise((r) => setTimeout(r, 1500));
    }
    throw new Error(`dev server did not become reachable on host port ${handle.hostPort} within 90s (see /workspace/dev.log in ${handle.containerName})`);
  }

  private async probe(hostPort: number): Promise<boolean> {
    try {
      const res = await fetch(`http://localhost:${hostPort}/`, { signal: AbortSignal.timeout(2000) });
      return res.status < 500;
    } catch {
      return false;
    }
  }

  async destroy(handle: SandboxHandle): Promise<void> {
    await this.destroyProject(handle.projectId);
  }

  /** Remove the project's container AND its node_modules/.next volumes. Idempotent. */
  async destroyProject(projectId: string): Promise<void> {
    await docker(['rm', '-f', `dbuilder-${projectId}`]);
    await docker(['volume', 'rm', '-f', `dbuilder-nm-${projectId}`, `dbuilder-next-${projectId}`]);
  }
}

function composeBuildPrompt(request: BuildRequest): string {
  const header =
    request.kind === 'initial'
      ? 'A community request arrived for the INITIAL build of this app.'
      : 'A follow-up EDIT request arrived from the community thread for this existing app. Existing data must be preserved (see AGENTS.md "Seed data & data preservation").';
  return [
    header,
    '',
    `Request (verbatim): ${request.prompt}`,
    '',
    'Follow AGENTS.md in the workspace root: implement the request within the allowed boundaries, run the mandatory quality loop, and write BUILD_RESULT.json before finishing.',
  ].join('\n');
}

function synthesizedFailure(reason: string): BuildResultFile {
  return {
    status: 'failed',
    summary: 'The build did not complete.',
    changes: [],
    screenshots: [],
    notes: [reason],
    dataReset: false,
    attempts: 0,
  };
}
