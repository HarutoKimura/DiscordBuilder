import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadConfig } from './config.js';

// Every env var loadConfig reads. Cleared before each test and restored after,
// so tests are hermetic regardless of the host/CI environment.
const MANAGED_KEYS = [
  'DISCORD_BOT_TOKEN',
  'DISCORD_CLIENT_ID',
  'OPENAI_API_KEY',
  'BASE_DOMAIN',
  'SANDBOX_MODE',
  'CODEX_MODEL',
  'CODEX_AUTH_MODE',
  'DEPLOY_MODE',
] as const;

let saved: Partial<Record<(typeof MANAGED_KEYS)[number], string | undefined>>;

beforeEach(() => {
  saved = {};
  for (const key of MANAGED_KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of MANAGED_KEYS) {
    const value = saved[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe('loadConfig defaults', () => {
  it('returns defaults with an empty environment', () => {
    expect(loadConfig()).toEqual({
      discordBotToken: '',
      discordClientId: '',
      openaiApiKey: '',
      baseDomain: 'localhost',
      sandboxMode: 'local-docker',
      codexModel: 'gpt-5.6-sol',
      codexAuthMode: 'chatgpt',
      deployMode: 'local',
    });
  });

  it('passes explicit env values through', () => {
    process.env.DISCORD_BOT_TOKEN = 'token-123';
    process.env.DISCORD_CLIENT_ID = 'client-456';
    process.env.OPENAI_API_KEY = 'sk-test';
    process.env.BASE_DOMAIN = 'builds.example.com';
    process.env.CODEX_MODEL = 'gpt-6-test';
    expect(loadConfig()).toMatchObject({
      discordBotToken: 'token-123',
      discordClientId: 'client-456',
      openaiApiKey: 'sk-test',
      baseDomain: 'builds.example.com',
      codexModel: 'gpt-6-test',
    });
  });
});

describe('loadConfig requireDiscord', () => {
  it('throws when DISCORD_BOT_TOKEN is missing', () => {
    process.env.DISCORD_CLIENT_ID = 'client-456';
    expect(() => loadConfig({ requireDiscord: true })).toThrow(
      'Missing required env var: DISCORD_BOT_TOKEN',
    );
  });

  it('throws when DISCORD_CLIENT_ID is missing', () => {
    process.env.DISCORD_BOT_TOKEN = 'token-123';
    expect(() => loadConfig({ requireDiscord: true })).toThrow(
      'Missing required env var: DISCORD_CLIENT_ID',
    );
  });

  it('succeeds when both Discord vars are set', () => {
    process.env.DISCORD_BOT_TOKEN = 'token-123';
    process.env.DISCORD_CLIENT_ID = 'client-456';
    expect(loadConfig({ requireDiscord: true })).toMatchObject({
      discordBotToken: 'token-123',
      discordClientId: 'client-456',
    });
  });

  it('does not require Discord vars by default', () => {
    expect(() => loadConfig()).not.toThrow();
  });
});

describe('CODEX_AUTH_MODE parsing', () => {
  it.each(['', 'chatgpt'])('treats %j as chatgpt', (value) => {
    process.env.CODEX_AUTH_MODE = value;
    expect(loadConfig().codexAuthMode).toBe('chatgpt');
  });

  it('accepts api-key when OPENAI_API_KEY is set', () => {
    process.env.CODEX_AUTH_MODE = 'api-key';
    process.env.OPENAI_API_KEY = 'sk-test';
    expect(loadConfig().codexAuthMode).toBe('api-key');
  });

  it('rejects api-key without OPENAI_API_KEY (fail fast at startup)', () => {
    process.env.CODEX_AUTH_MODE = 'api-key';
    expect(() => loadConfig()).toThrow(
      'CODEX_AUTH_MODE=api-key requires OPENAI_API_KEY to be set',
    );
  });

  it('rejects unknown values', () => {
    process.env.CODEX_AUTH_MODE = 'oauth';
    expect(() => loadConfig()).toThrow('Invalid CODEX_AUTH_MODE: "oauth"');
  });
});

describe('DEPLOY_MODE parsing', () => {
  it.each(['', 'local'])('treats %j as local', (value) => {
    process.env.DEPLOY_MODE = value;
    expect(loadConfig().deployMode).toBe('local');
  });

  it('accepts cloudflared', () => {
    process.env.DEPLOY_MODE = 'cloudflared';
    expect(loadConfig().deployMode).toBe('cloudflared');
  });

  it('rejects unknown values', () => {
    process.env.DEPLOY_MODE = 'vercel';
    expect(() => loadConfig()).toThrow('Invalid DEPLOY_MODE: "vercel"');
  });
});
