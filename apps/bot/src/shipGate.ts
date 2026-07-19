// M3 ship-approval gate: after a successful build the bot posts a vote message
// in the thread; 👍 from REQUIRED_VOTES distinct humans approves the ship.
//
// Gates live in memory only: a bot restart forgets unresolved votes. That is a
// deliberate M3 simplification — the demo runs within one bot lifetime, and a
// lost gate costs one extra /build, not data.
import type { MessageReaction, PartialMessageReaction, PartialUser, ThreadChannel, User } from 'discord.js';

const APPROVAL_EMOJI = '👍';
const REQUIRED_VOTES = 2;

interface ArmedGate {
  projectId: string;
  approved: boolean;
}

const gates = new Map<string, ArmedGate>(); // approval message id → gate

function voteMessageText(remaining: number): string {
  return (
    `🗳️ このバージョンでOKなら ${APPROVAL_EMOJI} で投票してください — **${REQUIRED_VOTES}票**で本番公開が承認されます` +
    `(あと**${remaining}票**。Botの${APPROVAL_EMOJI}はカウントされません)。` +
    '\n直したいところがあれば、このスレッドに返信するだけで編集できます。'
  );
}

interface GateLocation {
  messageId: string;
  thread: ThreadChannel;
}

// Only the LATEST successful build of a project is voteable — arming a new
// gate closes the previous one, or stale votes on an old message would
// "approve" a version that has since changed.
const latestGateByProject = new Map<string, GateLocation>();

/** Post the vote message for a successful build and start counting. */
export async function armShipGate(thread: ThreadChannel, projectId: string): Promise<void> {
  const previous = latestGateByProject.get(projectId);
  if (previous) {
    gates.delete(previous.messageId);
    await previous.thread.messages
      .edit(previous.messageId, '🗳️ ~~この投票は締め切られました~~(新しいビルドが完了したため)')
      .catch(() => {});
  }

  const message = await thread.send(voteMessageText(REQUIRED_VOTES));
  gates.set(message.id, { projectId, approved: false });
  latestGateByProject.set(projectId, { messageId: message.id, thread });
  // Seed the reaction as a one-tap button. The bot's own vote never counts.
  await message.react(APPROVAL_EMOJI).catch(() => {});
}

/** MessageReactionAdd handler: resolves a gate once enough humans voted. */
export async function handleShipReaction(
  reaction: MessageReaction | PartialMessageReaction,
  user: User | PartialUser,
): Promise<void> {
  if (user.bot) return;
  const gate = gates.get(reaction.message.id);
  if (!gate || gate.approved) return;

  const full = reaction.partial ? await reaction.fetch() : reaction;
  // startsWith: skin-toned 👍 variants are distinct emoji but the same vote.
  if (!full.emoji.name?.startsWith(APPROVAL_EMOJI)) return;

  const users = await full.users.fetch();
  const votes = users.filter((u) => !u.bot).size;
  if (votes < REQUIRED_VOTES) {
    // Progress feedback — without it a first vote looks like a dead button
    // (the bot's seed reaction inflates the visible count but never counts).
    const message = full.message.partial ? await full.message.fetch() : full.message;
    await message.edit(voteMessageText(REQUIRED_VOTES - votes)).catch(() => {});
    return;
  }

  // Re-check AFTER the awaits: two near-simultaneous reactions both pass the
  // early guard, and only this synchronous check-and-set keeps the second
  // continuation from announcing the approval twice.
  if (gate.approved) return;
  gate.approved = true;
  gates.delete(reaction.message.id);
  if (latestGateByProject.get(gate.projectId)?.messageId === reaction.message.id) {
    latestGateByProject.delete(gate.projectId);
  }

  const channel = full.message.channel;
  if (channel.isThread()) {
    await channel.send(
      `🚀 ${APPROVAL_EMOJI} が ${REQUIRED_VOTES}票集まりました!このバージョンの本番公開が承認されました 🎉`,
    );
  }
}
