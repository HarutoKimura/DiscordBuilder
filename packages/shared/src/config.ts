export type SandboxMode = 'local-docker';

/**
 * Where generated apps are served from.
 * - 'local': localhost:<port> — reachable only on the host (M1 CLI, quick tests).
 * - 'cloudflared': a Cloudflare quick tunnel per project → public HTTPS URL that
 *   community members can open. Keeps the SQLite app running in its container.
 */
export type DeployMode = 'local' | 'cloudflared';

/**
 * How codex authenticates inside sandbox containers.
 * - 'chatgpt': copy the host's $CODEX_HOME/auth.json (ChatGPT-subscription login)
 *   into the container at creation. Default for development/testing.
 * - 'api-key': pipe OPENAI_API_KEY into `codex login --with-api-key` in the
 *   container. Final/production setup.
 */
export type CodexAuthMode = 'chatgpt' | 'api-key';

export interface AppConfig {
  discordBotToken: string;
  discordClientId: string;
  openaiApiKey: string;
  baseDomain: string;
  sandboxMode: SandboxMode;
  /** Model id passed to `codex exec -m`. */
  codexModel: string;
  codexAuthMode: CodexAuthMode;
  deployMode: DeployMode;
}

const DEFAULT_CODEX_MODEL = 'gpt-5.6-sol';

function parseCodexAuthMode(value: string | undefined): CodexAuthMode {
  if (value === undefined || value === '' || value === 'chatgpt') return 'chatgpt';
  if (value === 'api-key') return 'api-key';
  throw new Error(`Invalid CODEX_AUTH_MODE: "${value}" (expected "chatgpt" or "api-key")`);
}

function parseDeployMode(value: string | undefined): DeployMode {
  if (value === undefined || value === '' || value === 'local') return 'local';
  if (value === 'cloudflared') return 'cloudflared';
  throw new Error(`Invalid DEPLOY_MODE: "${value}" (expected "local" or "cloudflared")`);
}

/**
 * Loads config from process.env. Discord vars are only required when the bot
 * runs (M2+); the CLI path (M1) works without them.
 */
export function loadConfig(opts: { requireDiscord?: boolean } = {}): AppConfig {
  const env = process.env;
  const required = (key: string): string => {
    const value = env[key];
    if (!value) throw new Error(`Missing required env var: ${key}`);
    return value;
  };
  const codexAuthMode = parseCodexAuthMode(env.CODEX_AUTH_MODE);
  const openaiApiKey = env.OPENAI_API_KEY ?? '';
  // Fail fast at startup: otherwise this misconfiguration only surfaces as a
  // per-build sandbox-constructor throw after progress reporting has started.
  if (codexAuthMode === 'api-key' && !openaiApiKey) {
    throw new Error('CODEX_AUTH_MODE=api-key requires OPENAI_API_KEY to be set');
  }
  return {
    discordBotToken: opts.requireDiscord ? required('DISCORD_BOT_TOKEN') : (env.DISCORD_BOT_TOKEN ?? ''),
    discordClientId: opts.requireDiscord ? required('DISCORD_CLIENT_ID') : (env.DISCORD_CLIENT_ID ?? ''),
    openaiApiKey,
    baseDomain: env.BASE_DOMAIN ?? 'localhost',
    sandboxMode: (env.SANDBOX_MODE ?? 'local-docker') as SandboxMode,
    codexModel: env.CODEX_MODEL ?? DEFAULT_CODEX_MODEL,
    codexAuthMode,
    deployMode: parseDeployMode(env.DEPLOY_MODE),
  };
}
