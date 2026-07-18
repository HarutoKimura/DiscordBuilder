// Project working directories and the on-disk registry (var/projects/).
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';

/** Files never copied from the template into a project working copy. */
const TEMPLATE_COPY_EXCLUDES = new Set([
  'node_modules',
  '.next',
  'data',
  'screenshots',
  'BUILD_RESULT.json',
  'tsconfig.tsbuildinfo',
  '.git',
]);

export interface ProjectRecord {
  id: string;
  hostPort: number;
  containerName: string;
  createdAt: string;
  builds: number;
}

export interface Registry {
  nextPort: number;
  projects: Record<string, ProjectRecord>;
}

const FIRST_PORT = 4100;

export class ProjectStore {
  private readonly projectsDir: string;
  private readonly registryPath: string;

  constructor(varDir: string) {
    this.projectsDir = join(varDir, 'projects');
    this.registryPath = join(this.projectsDir, 'registry.json');
    mkdirSync(this.projectsDir, { recursive: true });
  }

  appDir(projectId: string): string {
    return join(this.projectsDir, projectId, 'app');
  }

  logsDir(projectId: string): string {
    return join(this.projectsDir, projectId, 'logs');
  }

  readRegistry(): Registry {
    if (!existsSync(this.registryPath)) return { nextPort: FIRST_PORT, projects: {} };
    return JSON.parse(readFileSync(this.registryPath, 'utf8')) as Registry;
  }

  private writeRegistry(registry: Registry): void {
    writeFileSync(this.registryPath, JSON.stringify(registry, null, 2) + '\n');
  }

  /** Get the project record, creating it (and allocating a host port) on first use. */
  ensureProject(projectId: string): ProjectRecord {
    const registry = this.readRegistry();
    const existing = registry.projects[projectId];
    if (existing) return existing;
    const record: ProjectRecord = {
      id: projectId,
      hostPort: registry.nextPort,
      containerName: `dbuilder-${projectId}`,
      createdAt: new Date().toISOString(),
      builds: 0,
    };
    registry.nextPort += 1;
    registry.projects[projectId] = record;
    this.writeRegistry(registry);
    return record;
  }

  /** Increment the build counter and return the new build number (1-based). */
  nextBuildNumber(projectId: string): number {
    const registry = this.readRegistry();
    const record = registry.projects[projectId];
    if (!record) throw new Error(`Unknown project: ${projectId}`);
    record.builds += 1;
    this.writeRegistry(registry);
    return record.builds;
  }

  /** Copy the app template into the project's working dir (no-op if already present). */
  materializeTemplate(projectId: string, templateDir: string): { created: boolean } {
    const dest = this.appDir(projectId);
    if (existsSync(dest)) return { created: false };
    mkdirSync(join(this.projectsDir, projectId), { recursive: true });
    cpSync(templateDir, dest, {
      recursive: true,
      filter: (src) => !TEMPLATE_COPY_EXCLUDES.has(basename(src)),
    });
    mkdirSync(this.logsDir(projectId), { recursive: true });
    return { created: true };
  }
}
