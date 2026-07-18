// M2 entry point: discord.js v14 bot + orchestrator.
// /build <request> → thread → streamed progress (one edited message) → result + preview URL.
//
// Intents: Guilds only for M2. M3 adds GuildMessages + MessageContent (thread
// replies as edit tasks — requires the MESSAGE CONTENT toggle in the dev portal)
// and GuildMessageReactions (👍×2 ship gate).
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  ChannelType,
  Client,
  Events,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';
import { findRepoRoot, loadConfig, type AppConfig } from '@discordbuilder/shared';
import { BuildQueue } from './orchestrator.js';
import { ThreadStore } from './threadStore.js';
import { runBuildInThread } from './buildRunner.js';
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

  void queue
    .enqueue(projectId, () =>
      runBuildInThread(repoRoot, config, {
        projectId,
        kind: 'initial',
        prompt,
        requestedBy: interaction.user.id,
        thread,
      }),
    )
    .catch(async (err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      await thread.send(`❌ 予期しないエラー: ${message.slice(0, 500)}`).catch(() => {});
    });
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
  // User text is echoed into bot messages; never let it ping anyone.
  allowedMentions: { parse: [] },
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

client.login(config.discordBotToken).catch((err: unknown) => {
  console.error('[bot] login failed:', err instanceof Error ? err.message : err);
  console.error('[bot] check DISCORD_BOT_TOKEN in .env');
  process.exit(1);
});
