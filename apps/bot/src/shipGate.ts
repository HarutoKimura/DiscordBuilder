// M3 ship-approval gate: after a successful build the bot posts a vote message
// in the thread; 👍 from enough distinct humans approves the ship.
//
// Gates live in memory only: a bot restart forgets unresolved votes. That is a
// deliberate M3 simplification — the demo runs within one bot lifetime, and a
// lost gate costs one extra /build, not data.
import type { MessageReaction, PartialMessageReaction, PartialUser, ThreadChannel, User } from 'discord.js';
import { truncateText } from './util.js';

const APPROVAL_EMOJI = '👍';

// Overridden at startup from SHIP_APPROVAL_VOTES (solo demos set 1).
let requiredVotes = 2;

export function configureShipGate(opts: { requiredVotes: number }): void {
  requiredVotes = opts.requiredVotes;
}

interface ArmedGate {
  projectId: string;
  /** Preview URL of the build under vote — announced on approval. */
  url: string;
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
    `🗳️ Happy with this version? Vote ${APPROVAL_EMOJI} — **${requiredVotes} vote(s)** approve it for release ` +
    `(**${remaining} more** needed; the bot's ${APPROVAL_EMOJI} doesn't count).` +
    '\nWant changes? Just reply in this thread.'
  );
}

/** Post the vote message for a successful build and start counting. */
export async function armShipGate(thread: ThreadChannel, projectId: string, url: string): Promise<void> {
  const previous = latestGateByProject.get(projectId);
  if (previous) {
    gates.delete(previous.messageId);
    // Dropped now, not after the new send: on send failure the map must not
    // keep pointing at a gate that no longer exists.
    latestGateByProject.delete(projectId);
    await previous.thread.messages
      .edit(previous.messageId, '🗳️ ~~This vote is closed~~ (a newer build finished)')
      .catch(() => {});
  }

  let message;
  try {
    message = await thread.send(voteMessageText(requiredVotes));
  } catch (err) {
    // The old vote (if any) is already closed — tell the thread rather than
    // leaving it looking like voting silently disappeared.
    await thread
      .send('⚠️ Posting the vote message failed. Reply in this thread to rebuild and restart the vote.')
      .catch(() => {});
    throw err;
  }
  gates.set(message.id, { projectId, url, approved: false });
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
    // A concurrent handler that saw the winning vote may have resolved the
    // gate while we were fetching voters — don't overwrite its result.
    if (gate.approved) return;
    // Progress feedback — without it a first vote looks like a dead button
    // (the bot's seed reaction inflates the visible count but never counts).
    await message.edit(voteMessageText(requiredVotes - voters.size)).catch(() => {});
    return;
  }

  gate.approved = true;
  const channel = message.channel;
  if (channel.isThread()) {
    try {
      await channel.send(
        `🚀 ${requiredVotes} ${APPROVAL_EMOJI} vote(s) in! This version is approved for release 🎉`,
      );
    } catch (err) {
      // The announcement is the whole point of the gate — leave it armed so a
      // later reaction retries, instead of losing the approval silently.
      gate.approved = false;
      throw err;
    }
  }

  gates.delete(reaction.message.id);
  if (latestGateByProject.get(gate.projectId)?.messageId === reaction.message.id) {
    latestGateByProject.delete(gate.projectId);
  }
  // Rewrite the vote message last: it also repairs any stale "あと1票" text a
  // losing concurrent handler may have written moments ago.
  await message.edit(`🗳️ ~~Voting closed~~ — approved with ${requiredVotes} vote(s) ✅`).catch(() => {});

  // Make the approval visible OUTSIDE the thread: the community's vote just
  // "released" an app, so the parent channel gets a launch announcement and
  // the thread gets a ✅ badge. Both best-effort — the in-thread announcement
  // above is the source of truth.
  if (channel.isThread()) {
    await announceLaunch(channel, gate.url);
  }
}

async function announceLaunch(thread: ThreadChannel, url: string): Promise<void> {
  if (!thread.name.startsWith('✅')) {
    await thread.setName(truncateText(`✅ ${thread.name}`, 100)).catch(() => {});
  }
  try {
    const parent = thread.parent ?? (thread.parentId ? await thread.guild.channels.fetch(thread.parentId) : null);
    if (parent?.isTextBased()) {
      await parent.send(
        `🎉 A community-approved app just shipped!\n📱 ${url}\n💬 Build history: <#${thread.id}>`,
      );
    }
  } catch (err) {
    console.error('[bot] launch announcement failed:', err instanceof Error ? err.message : err);
  }
}
