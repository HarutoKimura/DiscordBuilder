// Runs one build for a Discord thread: sandbox → codex → result post.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { AttachmentBuilder, EmbedBuilder, type ThreadChannel } from 'discord.js';
import type { AppConfig, BuildKind, BuildResultFile } from '@discordbuilder/shared';
import { LocalDockerSandbox } from '@discordbuilder/sandbox';
import { LocalDeployTarget } from '@discordbuilder/deploy';
import { ProgressReporter } from './progress.js';

const MAX_SCREENSHOTS = 4;

export interface BuildJob {
  projectId: string;
  kind: BuildKind;
  prompt: string;
  requestedBy: string;
  thread: ThreadChannel;
}

export async function runBuildInThread(repoRoot: string, config: AppConfig, job: BuildJob): Promise<void> {
  const status = await job.thread.send('⏳ ビルドを準備しています…');
  const reporter = new ProgressReporter(status);

  try {
    const sandbox = new LocalDockerSandbox({
      repoRoot,
      codexModel: config.codexModel,
      codexAuthMode: config.codexAuthMode,
      openaiApiKey: config.openaiApiKey || undefined,
      onLog: (message) => reporter.onLog(message),
    });
    const handle = await sandbox.create(job.projectId);
    const result = await sandbox.runBuild(
      handle,
      { projectId: job.projectId, kind: job.kind, prompt: job.prompt, requestedBy: job.requestedBy },
      (event) => reporter.onEvent(event),
    );
    const { url } = await new LocalDeployTarget().register(job.projectId, handle.hostPort);

    await reporter.finish(
      result.status === 'failed' ? '🏗️ ビルドが終了しました(失敗)' : '🏗️ ビルドが完了しました',
    );
    await postResult(job.thread, result, url, handle.appDir);
  } catch (err) {
    await reporter.finish('🏗️ ビルドが中断されました');
    const message = err instanceof Error ? err.message : String(err);
    await job.thread.send(`❌ ビルドに失敗しました: ${message.slice(0, 500)}\nもう一度 \`/build\` で試すか、管理者に連絡してください。`);
  }
}

async function postResult(
  thread: ThreadChannel,
  result: BuildResultFile,
  url: string,
  appDir: string,
): Promise<void> {
  const color = result.status === 'success' ? 0x57f287 : result.status === 'partial' ? 0xfee75c : 0xed4245;
  const title =
    result.status === 'success' ? '✅ できました!' : result.status === 'partial' ? '🟡 一部できました' : '❌ 失敗しました';

  const embed = new EmbedBuilder().setColor(color).setTitle(title).setDescription(result.summary.slice(0, 4000));
  if (result.changes.length > 0) {
    embed.addFields({
      name: '変更内容',
      value: result.changes.map((c) => `• ${c}`).join('\n').slice(0, 1024),
    });
  }
  if (result.notes.length > 0) {
    embed.addFields({
      name: 'メモ',
      value: result.notes.map((n) => `• ${n}`).join('\n').slice(0, 1024),
    });
  }
  if (result.dataReset) {
    embed.addFields({
      name: '⚠️ データリセット',
      value: 'この変更で、これまでに入力されたデータが削除されました。',
    });
  }
  if (result.status !== 'failed') {
    embed.addFields({ name: 'プレビュー', value: url });
  }

  const files = result.screenshots
    .map((rel) => join(appDir, rel))
    .filter((p) => existsSync(p))
    .slice(0, MAX_SCREENSHOTS)
    .map((p) => new AttachmentBuilder(p));

  await thread.send({ embeds: [embed], files });
}
