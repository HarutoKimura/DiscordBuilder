// Runs one build for a Discord thread: sandbox → codex → result post.
import { lstatSync, realpathSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { AttachmentBuilder, EmbedBuilder, type ThreadChannel } from 'discord.js';
import type { AppConfig, BuildKind, BuildResultFile } from '@discordbuilder/shared';
import { LocalDockerSandbox } from '@discordbuilder/sandbox';
import type { DeployTarget } from '@discordbuilder/deploy';
import { ProgressReporter } from './progress.js';
import { truncateText } from './util.js';

const MAX_SCREENSHOTS = 4;

export interface BuildJob {
  projectId: string;
  kind: BuildKind;
  prompt: string;
  requestedBy: string;
  thread: ThreadChannel;
}

export async function runBuildInThread(
  repoRoot: string,
  config: AppConfig,
  deploy: DeployTarget,
  job: BuildJob,
): Promise<void> {
  const status = await job.thread.send('⏳ ビルドを準備しています…');
  const reporter = new ProgressReporter(status);

  let sandbox: LocalDockerSandbox | undefined;
  let handle;
  let result: BuildResultFile;
  try {
    // Constructed inside the try so a constructor throw still reaches
    // reporter.finish() — otherwise the progress interval leaks forever.
    sandbox = new LocalDockerSandbox({
      repoRoot,
      codexModel: config.codexModel,
      codexAuthMode: config.codexAuthMode,
      openaiApiKey: config.openaiApiKey || undefined,
      onLog: (message) => reporter.onLog(message),
    });
    handle = await sandbox.create(job.projectId);
    result = await sandbox.runBuild(
      handle,
      { projectId: job.projectId, kind: job.kind, prompt: job.prompt, requestedBy: job.requestedBy },
      (event) => reporter.onEvent(event),
    );
  } catch (err) {
    await reporter.finish('🏗️ ビルドが中断されました');
    const message = err instanceof Error ? err.message : String(err);
    await job.thread
      .send(`❌ ビルドに失敗しました: ${truncateText(message, 500)}\nもう一度 \`/build\` で試すか、管理者に連絡してください。`)
      .catch(() => {});
    // A failed INITIAL build leaves nothing worth keeping — reclaim the
    // container and volumes so retries don't pile up dead resources.
    // (Edit tasks keep theirs: the previous good app is still running.)
    if (job.kind === 'initial') await sandbox?.destroyProject(job.projectId).catch(() => {});
    return;
  }

  await reporter.finish(result.status === 'failed' ? '🏗️ ビルドが終了しました(失敗)' : '🏗️ ビルドが完了しました');

  let url: string | undefined;
  if (result.status !== 'failed') {
    try {
      ({ url } = await deploy.register(job.projectId, handle.hostPort));
    } catch (err) {
      console.error('[bot] deploy register failed:', err instanceof Error ? err.message : err);
      await job.thread
        .send(`⚠️ アプリはできましたが、公開URLの発行に失敗しました: ${truncateText(err instanceof Error ? err.message : String(err), 300)}`)
        .catch(() => {});
    }
  }

  try {
    await postResult(job.thread, result, url, handle.appDir);
  } catch (err) {
    // The build already succeeded/failed on its own merits — a Discord-side
    // rendering error must not misreport it. Fall back to plain text.
    console.error('[bot] result post failed:', err instanceof Error ? err.message : err);
    const fallback =
      result.status === 'failed'
        ? '❌ ビルドは失敗しました(結果の表示にも失敗しました)。'
        : url
          ? `✅ ビルドは完了しています。プレビュー: ${url}`
          : '✅ ビルドは完了しています(結果の表示に失敗しました)。';
    await job.thread.send(fallback).catch(() => {});
  }

  if (result.status === 'failed' && job.kind === 'initial') {
    await sandbox?.destroyProject(job.projectId).catch(() => {});
  }
}

async function postResult(
  thread: ThreadChannel,
  result: BuildResultFile,
  url: string | undefined,
  appDir: string,
): Promise<void> {
  const color = result.status === 'success' ? 0x57f287 : result.status === 'partial' ? 0xfee75c : 0xed4245;
  const title =
    result.status === 'success' ? '✅ できました!' : result.status === 'partial' ? '🟡 一部できました' : '❌ 失敗しました';

  // Piece budgets keep the combined embed under Discord's 6000-char total:
  // 3000 + 1000 + 800 + ~120 of fixed text.
  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setDescription(truncateText(result.summary.trim() || '(結果の説明がありません)', 3000));
  if (result.changes.length > 0) {
    embed.addFields({
      name: '変更内容',
      value: truncateText(result.changes.map((c) => `• ${c}`).join('\n'), 1000),
    });
  }
  if (result.notes.length > 0) {
    embed.addFields({
      name: 'メモ',
      value: truncateText(result.notes.map((n) => `• ${n}`).join('\n'), 800),
    });
  }
  if (result.dataReset) {
    embed.addFields({
      name: '⚠️ データリセット',
      value: 'この変更で、これまでに入力されたデータが削除されました。',
    });
  }
  if (result.status !== 'failed' && url) {
    embed.addFields({ name: 'プレビュー', value: truncateText(url, 200) });
  }

  // BUILD_RESULT.json is written by the sandboxed agent and is UNTRUSTED input:
  // refuse anything outside the project's app dir. The textual check alone is
  // not enough — appDir is bind-mounted into the container, so the agent can
  // plant a symlink whose path is inside appRoot but whose target is any host
  // file (e.g. .env). Reject non-regular files and re-check containment on the
  // dereferenced real path.
  const appRoot = realpathSync(appDir);
  const files = result.screenshots
    .map((rel) => resolve(appRoot, rel))
    .filter((p) => {
      if (!p.startsWith(appRoot + sep)) return false;
      try {
        if (!lstatSync(p).isFile()) return false;
        return realpathSync(p).startsWith(appRoot + sep);
      } catch {
        return false; // missing or unreadable — skip
      }
    })
    .slice(0, MAX_SCREENSHOTS)
    .map((p) => new AttachmentBuilder(p));

  await thread.send({ embeds: [embed], files });
}
