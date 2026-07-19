// M3 ship-approval gate: after a successful build the bot posts a vote message
// in the thread; 👍 from enough distinct humans approves the ship.
//
// Gates live in memory only: a bot restart forgets unresolved votes. That is a
// deliberate M3 simplification — the demo runs within one bot lifetime, and a
// lost gate costs one extra /build, not data.
import type { MessageReaction, PartialMessageReaction, PartialUser, ThreadChannel, User } from 'discord.js';

const APPROVAL_EMOJI = '👍';

// Overridden at startup from SHIP_APPROVAL_VOTES (solo demos set 1).
let requiredVotes = 2;

export function configureShipGate(opts: { requiredVotes: number }): void {
  requiredVotes = opts.requiredVotes;
}

interface ArmedGate {
  projectId: string;
  approved: boolean;
}

const gates = new Map<string, ArmedGate>(); // approval message id → gate

interface GateLocation {
  messageId: string;
  thread: ThreadChannel;
}

// Only the LATEST successful build of a project is voteable — arming a new
// gate closes the previous one, or stale votes on an old message would
// "approve" a version that has since changed.
const latestGateByProject = new Map<string, GateLocation>();

function voteMessageText(remaining: number): string {
  return (
    `🗳️ このバージョンでOKなら ${APPROVAL_EMOJI} で投票してください — **${requiredVotes}票**で本番公開が承認されます` +
    `(あと**${remaining}票**。Botの${APPROVAL_EMOJI}はカウントされません)。` +
    '\n直したいところがあれば、このスレッドに返信するだけで編集できます。'
  );
}

/** Post the vote message for a successful build and start counting. */
export async function armShipGate(thread: ThreadChannel, projectId: string): Promise<void> {
  const previous = latestGateByProject.get(projectId);
  if (previous) {
    gates.delete(previous.messageId);
    await previous.thread.messages
      .edit(previous.messageId, '🗳️ ~~この投票は締め切られました~~(新しいビルドが完了したため)')
      .catch(() => {});
  }

  const message = await thread.send(voteMessageText(requiredVotes));
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
  if (!gates.has(reaction.message.id)) return;

  const full = reaction.partial ? await reaction.fetch() : reaction;
  if (!full.emoji.name?.startsWith(APPROVAL_EMOJI)) return;
  const message = full.message.partial ? await full.message.fetch() : full.message;

  // Count unique human voters across ALL 👍 variants: skin-toned thumbs are
  // distinct reactions with independent user lists, and votes split across
  // them must still add up to one total.
  const voters = new Set<string>();
  for (const variant of message.reactions.cache.values()) {
    if (!variant.emoji.name?.startsWith(APPROVAL_EMOJI)) continue;
    const users = await variant.users.fetch();
    for (const u of users.values()) if (!u.bot) voters.add(u.id);
  }

  // Re-resolve the gate AFTER every await: a concurrent armShipGate may have
  // superseded this message (deleting its gate), or a concurrent vote may have
  // already approved it. The pre-await reference must not be trusted.
  const gate = gates.get(reaction.message.id);
  if (!gate || gate.approved) return;

  if (voters.size < requiredVotes) {
    // Progress feedback — without it a first vote looks like a dead button
    // (the bot's seed reaction inflates the visible count but never counts).
    await message.edit(voteMessageText(requiredVotes - voters.size)).catch(() => {});
    return;
  }

  gate.approved = true;
  gates.delete(reaction.message.id);
  if (latestGateByProject.get(gate.projectId)?.messageId === reaction.message.id) {
    latestGateByProject.delete(gate.projectId);
  }

  const channel = message.channel;
  if (channel.isThread()) {
    await channel.send(
      `🚀 ${APPROVAL_EMOJI} が ${requiredVotes}票集まりました!このバージョンの本番公開が承認されました 🎉`,
    );
  }
}
