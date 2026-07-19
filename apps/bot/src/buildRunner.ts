// Runs one build for a Discord thread: sandbox → codex → result post.
import { closeSync, constants as fsConstants, fstatSync, openSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { basename, resolve, sep } from 'node:path';
import { AttachmentBuilder, EmbedBuilder, type ThreadChannel } from 'discord.js';
import type { AppConfig, BuildKind, BuildResultFile } from '@discordbuilder/shared';
import { LocalDockerSandbox } from '@discordbuilder/sandbox';
import type { DeployTarget } from '@discordbuilder/deploy';
import { ProgressReporter } from './progress.js';
import { armShipGate } from './shipGate.js';
import { truncateText } from './util.js';

const MAX_SCREENSHOTS = 4;
const MAX_SCREENSHOT_BYTES = 8 * 1024 * 1024; // Discord's default attachment limit
// The screenshots array is agent-authored and uncapped upstream; bound how many
// entries we even LOOK at, or a huge array of invalid paths would grind the
// single bot process through that much synchronous fs work.
const MAX_SCREENSHOT_CANDIDATES = 16;

export interface BuildJob {
  projectId: string;
  kind: BuildKind;
  prompt: string;
  requestedBy: string;
  thread: ThreadChannel;
}

interface InFlightBuild {
  projectId: string;
  kind: BuildKind;
  sandbox: LocalDockerSandbox;
}

// In-flight builds, so bot shutdown can apply the same cleanup policy as the
// normal failure path: an interrupted INITIAL build's container/volumes are
// reclaimed (edit builds keep the previous good app running).
const inFlightBuilds = new Set<InFlightBuild>();

/** Reclaim resources of initial builds interrupted by a bot shutdown. */
export async function destroyInterruptedInitialBuilds(): Promise<void> {
  await Promise.all(
    [...inFlightBuilds]
      .filter((build) => build.kind === 'initial')
      .map((build) => build.sandbox.destroyProject(build.projectId).catch(() => {})),
  );
}

export async function runBuildInThread(
  repoRoot: string,
  config: AppConfig,
  deploy: DeployTarget,
  job: BuildJob,
): Promise<BuildResultFile['status']> {
  const status = await job.thread.send('⏳ ビルドを準備しています…');
  const reporter = new ProgressReporter(status);

  let sandbox: LocalDockerSandbox | undefined;
  let inFlight: InFlightBuild | undefined;
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
    inFlight = { projectId: job.projectId, kind: job.kind, sandbox };
    inFlightBuilds.add(inFlight);
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
    // Deregistered only now: the entry must stay visible to shutdown cleanup
    // for as long as a destroyProject() is still owed.
    if (inFlight) inFlightBuilds.delete(inFlight);
    return 'failed';
  }
  // A successful (or partial) build owes no cleanup — deregister right away so
  // a shutdown during result posting can't destroy a healthy new app. A
  // failed-status initial build still owes the destroyProject() at the end of
  // this function, so its entry stays until then.
  if (inFlight && !(result.status === 'failed' && job.kind === 'initial')) {
    inFlightBuilds.delete(inFlight);
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
  if (inFlight) inFlightBuilds.delete(inFlight);

  // M3 gate: open the 👍 ship vote — but only for a version people can
  // actually open and review (deploy.register may have failed → no URL).
  if (result.status !== 'failed' && url) {
    await armShipGate(job.thread, job.projectId).catch((err: unknown) => {
      console.error('[bot] ship gate arm failed:', err instanceof Error ? err.message : err);
    });
  }
  return result.status;
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

  // BUILD_RESULT.json is written by the sandboxed agent and is UNTRUSTED input,
  // and appDir stays bind-mounted into a container whose generated app keeps
  // running while we upload. A path could be swapped for a symlink to a host
  // file between a check and the upload (TOCTOU), so the bytes are read through
  // ONE fd: O_NOFOLLOW rejects symlinks at open, and the same-inode comparison
  // proves the fd is the file the in-root path currently resolves to.
  const appRoot = realpathSync(appDir);
  const files: AttachmentBuilder[] = [];
  for (const rel of result.screenshots.slice(0, MAX_SCREENSHOT_CANDIDATES)) {
    if (files.length >= MAX_SCREENSHOTS) break;
    const p = resolve(appRoot, rel);
    if (!p.startsWith(appRoot + sep)) continue;
    let fd: number | undefined;
    try {
      fd = openSync(p, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
      const opened = fstatSync(fd);
      const real = realpathSync(p);
      const resolved = statSync(real);
      if (
        opened.isFile() &&
        opened.size <= MAX_SCREENSHOT_BYTES &&
        real.startsWith(appRoot + sep) &&
        resolved.dev === opened.dev &&
        resolved.ino === opened.ino
      ) {
        files.push(new AttachmentBuilder(readFileSync(fd), { name: basename(p) }));
      }
    } catch {
      // missing, a symlink (O_NOFOLLOW), or unreadable — skip
    } finally {
      if (fd !== undefined) closeSync(fd);
    }
  }

  await thread.send({ embeds: [embed], files });
}
