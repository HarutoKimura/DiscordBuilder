// M1 end-to-end pipeline without Discord:
//   pnpm cli build "<request>" [--project <id>]
// template copy -> sandbox container -> codex exec (streamed) -> BUILD_RESULT -> preview URL
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { findRepoRoot, loadConfig, type BuildRequest } from '@discordbuilder/shared';
import { LocalDockerSandbox, type CodexEvent } from '@discordbuilder/sandbox';
import { LocalDeployTarget } from '@discordbuilder/deploy';

function usage(): never {
  console.error('Usage: pnpm cli build "<what to build>" [--project <id>]');
  process.exit(1);
}

function parseArgs(argv: string[]): { prompt: string; projectId?: string } {
  const [command, ...rest] = argv;
  if (command !== 'build') usage();
  const parts: string[] = [];
  let projectId: string | undefined;
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === '--project') {
      projectId = rest[++i];
      if (!projectId) usage();
    } else {
      parts.push(rest[i]!);
    }
  }
  const prompt = parts.join(' ').trim();
  if (!prompt) usage();
  return { prompt, projectId };
}

/** Strip codex's shell wrapper (`/bin/bash -lc "..."`) for readable progress lines. */
function prettyCommand(command: string): string {
  const match = command.match(/^\S+\/(?:bash|zsh|sh) -lc\s+(.*)$/s);
  if (!match) return command;
  let inner = match[1]!.trim();
  const quote = inner[0];
  if ((quote === '"' || quote === "'") && inner.endsWith(quote)) inner = inner.slice(1, -1);
  return inner;
}

function renderEvent(event: CodexEvent): void {
  const item = event.item;
  switch (event.type) {
    case 'item.completed':
      if (item?.type === 'agent_message' && item.text) {
        console.log(`\n🤖 ${item.text}\n`);
      } else if (item?.type === 'command_execution' && item.exit_code !== 0) {
        console.log(`   ↳ exit ${item.exit_code}`);
      }
      break;
    case 'item.started':
      if (item?.type === 'command_execution' && item.command) {
        console.log(`   $ ${prettyCommand(item.command)}`);
      } else if (item?.type === 'file_change' && item.changes) {
        for (const change of item.changes) {
          console.log(`   ✎ ${change.kind}: ${change.path.replace(/^\/workspace\/app\//, '')}`);
        }
      }
      break;
    case 'turn.completed':
      if (event.usage) {
        console.log(
          `   (tokens: in ${event.usage.input_tokens ?? '?'} / out ${event.usage.output_tokens ?? '?'})`,
        );
      }
      break;
  }
}

async function main(): Promise<void> {
  const repoRoot = findRepoRoot();
  const envFile = join(repoRoot, '.env');
  if (existsSync(envFile)) process.loadEnvFile(envFile);

  const { prompt, projectId: givenId } = parseArgs(process.argv.slice(2));
  const config = loadConfig();
  const projectId = givenId ?? `app-${Math.random().toString(36).slice(2, 8)}`;
  const isExisting = existsSync(join(repoRoot, 'var', 'projects', projectId, 'app'));

  const request: BuildRequest = {
    projectId,
    kind: isExisting ? 'edit' : 'initial',
    prompt,
    requestedBy: 'cli',
  };
  console.log(`▶ project ${projectId} (${request.kind} build, model ${config.codexModel}, auth ${config.codexAuthMode})`);

  const sandbox = new LocalDockerSandbox({
    repoRoot,
    codexModel: config.codexModel,
    codexAuthMode: config.codexAuthMode,
    openaiApiKey: config.openaiApiKey || undefined,
    onLog: (message) => console.log(`• ${message}`),
  });

  const handle = await sandbox.create(projectId);
  const result = await sandbox.runBuild(handle, request, renderEvent);
  const { url } = await new LocalDeployTarget().register(projectId, handle.hostPort);

  console.log('\n────────────────────────────────────────');
  console.log(`status:  ${result.status}${result.dataReset ? '  ⚠ DATA WAS RESET' : ''}`);
  console.log(`summary: ${result.summary}`);
  for (const change of result.changes) console.log(`  - ${change}`);
  if (result.notes.length > 0) {
    console.log('notes:');
    for (const note of result.notes) console.log(`  - ${note}`);
  }
  if (result.screenshots.length > 0) {
    console.log('screenshots:');
    for (const shot of result.screenshots) console.log(`  - ${join(handle.appDir, shot)}`);
  }
  console.log(`\n🌐 preview: ${url}`);
  if (result.status === 'failed') process.exitCode = 1;
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
