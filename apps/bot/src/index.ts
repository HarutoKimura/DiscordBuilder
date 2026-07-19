// Bot entry point: discord.js v14 bot + orchestrator.
// M2: /build <request> → thread → streamed progress (one edited message) → result + preview URL.
// M3: thread replies become edit tasks; 👍×2 on the vote message approves the ship.
//
// Intents: MessageContent is privileged — it must be enabled under
// "Privileged Gateway Intents" in the Discord developer portal, or login fails.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  ChannelType,
  Client,
  Events,
  GatewayIntentBits,
  Partials,
  REST,
  Routes,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type Message,
  type ThreadChannel,
} from 'discord.js';
import { findRepoRoot, loadConfig, type AppConfig } from '@discordbuilder/shared';
import { createDeployTarget } from '@discordbuilder/deploy';
import { BuildQueue } from './orchestrator.js';
import { ThreadStore } from './threadStore.js';
import { destroyInterruptedInitialBuilds, runBuildInThread } from './buildRunner.js';
import { finishAllProgress } from './progress.js';
import { handleShipReaction } from './shipGate.js';
import { truncateText } from './util.js';

const repoRoot = findRepoRoot();
const envFile = join(repoRoot, '.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

function loadBotConfig(): AppConfig {
  try {
    return loadConfig({ requireDiscord: true });
  } catch (err) {
    console.error(`[bot] ${err instanceof Error ? err.message : err}`);
    console.error('[bot] set DISCORD_BOT_TOKEN and DISCORD_CLIENT_ID in .env (see .env.example)');
    process.exit(1);
  }
}

const config = loadBotConfig();
const queue = new BuildQueue();
const threads = new ThreadStore(repoRoot);
/** Threads whose build is enqueued but not yet started (see handleBuild). */
const queuedThreads = new Set<ThreadChannel>();
// One shared instance so per-project tunnels persist across builds.
const deploy = createDeployTarget(config.deployMode);

const buildCommand = new SlashCommandBuilder()
  .setName('build')
  .setDescription('みんなのアプリを作ります(Codexが実装します)')
  .addStringOption((option) =>
    option.setName('request').setDescription('作りたいものを普通の言葉で').setRequired(true).setMaxLength(1500),
  );

async function registerCommands(guildIds: string[]): Promise<void> {
  // Guild-scoped registration is instant (global takes up to an hour to appear).
  const rest = new REST().setToken(config.discordBotToken);
  for (const guildId of guildIds) {
    await rest.put(Routes.applicationGuildCommands(config.discordClientId, guildId), {
      body: [buildCommand.toJSON()],
    });
  }
}

function newProjectId(): string {
  return `app-${Math.random().toString(36).slice(2, 8)}`;
}

async function handleBuild(interaction: ChatInputCommandInteraction): Promise<void> {
  const prompt = interaction.options.getString('request', true).trim();
  const channel = interaction.channel;
  if (!interaction.inGuild() || channel?.type !== ChannelType.GuildText) {
    await interaction.reply({ content: 'このコマンドはサーバーのテキストチャンネルで使ってください。', ephemeral: true });
    return;
  }
  if (!prompt) {
    await interaction.reply({
      content: '作りたいものを教えてください。例: `/build request: 読書会の本を投票で決めるアプリ`',
      ephemeral: true,
    });
    return;
  }

  const projectId = newProjectId();
  await interaction.reply(`🏗️ 受け付けました! **「${truncateText(prompt, 200)}」** — スレッドで進捗をお知らせします。`);
  const replyMessage = await interaction.fetchReply();
  const thread = await replyMessage.startThread({
    name: truncateText(`🏗️ ${prompt}`, 100),
    autoArchiveDuration: 1440,
  });
  if (queue.busy) {
    await thread.send('⏳ ほかのビルドが実行中のため、順番待ちに入りました。開始したらここでお知らせします。');
  }
  threads.set(thread.id, {
    projectId,
    channelId: channel.id,
    guildId: interaction.guildId!,
    createdAt: new Date().toISOString(),
  });

  enqueueBuild(projectId, 'initial', prompt, interaction.user.id, thread);
}

/** Shared tail of both entry points (/build and thread replies). */
function enqueueBuild(
  projectId: string,
  kind: 'initial' | 'edit',
  prompt: string,
  requestedBy: string,
  thread: ThreadChannel,
): void {
  // Queued-but-not-started builds have no ProgressReporter yet, so shutdown
  // cleanup can't see them through the usual channels — track their threads
  // here until the job actually starts.
  queuedThreads.add(thread);
  void queue
    .enqueue(projectId, () => {
      queuedThreads.delete(thread);
      return runBuildInThread(repoRoot, config, deploy, { projectId, kind, prompt, requestedBy, thread });
    })
    .catch(async (err: unknown) => {
      queuedThreads.delete(thread);
      const message = err instanceof Error ? err.message : String(err);
      await thread.send(`❌ 予期しないエラー: ${truncateText(message, 500)}`).catch(() => {});
    });
}

/** M3: any human message in a bound thread is an edit request. */
async function handleThreadReply(message: Message): Promise<void> {
  if (message.author.bot) return;
  const channel = message.channel;
  if (!channel.isThread()) return;
  const binding = threads.get(channel.id);
  if (!binding) return;
  const prompt = message.content.trim();
  if (!prompt) return; // attachment-only or empty messages are not edit tasks

  await channel.send(
    `✏️ 編集リクエストを受け付けました: **「${truncateText(prompt, 200)}」**` +
      (queue.busy ? '\n⏳ ほかのビルドが実行中のため、順番待ちに入ります。' : ''),
  );
  enqueueBuild(binding.projectId, 'edit', prompt, message.author.id, channel);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.MessageContent,
  ],
  // Reaction events can arrive for uncached messages as partials.
  partials: [Partials.Message, Partials.Reaction, Partials.Channel],
  // User text is echoed into bot messages; never let it ping anyone.
  allowedMentions: { parse: [] },
});

client.on(Events.MessageCreate, (message) => {
  void handleThreadReply(message).catch((err: unknown) => {
    console.error('[bot] thread reply handling failed:', err instanceof Error ? err.message : err);
  });
});

client.on(Events.MessageReactionAdd, (reaction, user) => {
  void handleShipReaction(reaction, user).catch((err: unknown) => {
    console.error('[bot] ship reaction handling failed:', err instanceof Error ? err.message : err);
  });
});

client.once(Events.ClientReady, async (ready) => {
  try {
    const guildIds = [...ready.guilds.cache.keys()];
    await registerCommands(guildIds);
    console.log(`[bot] logged in as ${ready.user.tag}, /build registered in ${guildIds.length} guild(s)`);
  } catch (err) {
    console.error(
      '[bot] command registration failed (does DISCORD_CLIENT_ID match the bot token?):',
      err instanceof Error ? err.message : err,
    );
  }
});

client.on(Events.GuildCreate, async (guild) => {
  try {
    await registerCommands([guild.id]);
    console.log(`[bot] joined guild ${guild.name}, /build registered`);
  } catch (err) {
    console.error(`[bot] command registration failed for guild ${guild.id}:`, err instanceof Error ? err.message : err);
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand() || interaction.commandName !== 'build') return;
  try {
    await handleBuild(interaction);
  } catch (err) {
    console.error('[bot] /build failed:', err);
    const content = `❌ ビルドの開始に失敗しました: ${truncateText(err instanceof Error ? err.message : String(err), 300)}\nBotの権限(スレッド作成など)を確認してください。`;
    try {
      if (interaction.replied || interaction.deferred) await interaction.followUp({ content, ephemeral: true });
      else await interaction.reply({ content, ephemeral: true });
    } catch {
      // Nothing else we can do — the channel may be gone.
    }
  }
});

let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[bot] ${signal} received, shutting down…`);
  // Give quick builds a chance to finish; anything still running after the
  // grace period gets its status message marked as interrupted so the thread
  // isn't stuck on "ビルド中…" forever.
  const drained = await queue.drain(10_000);
  if (!drained) {
    console.warn('[bot] builds still in flight — marking their progress as interrupted');
    await finishAllProgress('⚠️ Bot の再起動によりビルドが中断されました。もう一度 `/build` を実行してください。').catch(
      () => {},
    );
    // Builds still waiting for a queue slot never started a reporter — keep
    // the promise their "順番待ち" message made and tell them explicitly.
    await Promise.all(
      [...queuedThreads].map((thread) =>
        thread
          .send('⚠️ Bot の再起動により、順番待ち中のビルドはキャンセルされました。もう一度 `/build` を実行してください。')
          .catch(() => {}),
      ),
    );
    // Same policy as the in-run failure path: interrupted initial builds get
    // their container/volumes/port reclaimed instead of leaking on every restart.
    await destroyInterruptedInitialBuilds();
  }
  await deploy.shutdown?.().catch(() => {});
  await client.destroy().catch(() => {});
  process.exit(0);
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

console.log(`[bot] deploy mode: ${config.deployMode}`);
client.login(config.discordBotToken).catch((err: unknown) => {
  console.error('[bot] login failed:', err instanceof Error ? err.message : err);
  console.error('[bot] check DISCORD_BOT_TOKEN in .env');
  process.exit(1);
});
