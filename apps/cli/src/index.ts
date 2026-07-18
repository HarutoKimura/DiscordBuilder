import { loadConfig } from '@discordbuilder/shared';

function usage(): never {
  console.error('Usage: pnpm cli build "<what to build>"');
  process.exit(1);
}

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2);
  if (command !== 'build' || rest.length === 0) usage();
  const prompt = rest.join(' ').trim();
  if (!prompt) usage();

  const config = loadConfig();
  console.log(`[cli] build requested: ${prompt}`);
  console.log(`[cli] codex model: ${config.codexModel}, sandbox: ${config.sandboxMode}`);

  // M1 pipeline: copy template -> LocalDockerSandbox.create -> runBuild (codex exec
  // + quality loop inside the container) -> LocalDeployTarget.register -> print URL.
  throw new Error('M1 pipeline not implemented yet');
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
