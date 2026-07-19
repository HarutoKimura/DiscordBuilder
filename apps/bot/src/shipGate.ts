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

/** Post the vote message for a successful build and start counting. */
export async function armShipGate(thread: ThreadChannel, projectId: string): Promise<void> {
  const message = await thread.send(
    `🗳️ このバージョンでOKなら ${APPROVAL_EMOJI} で投票してください — **${REQUIRED_VOTES}票**で本番公開が承認されます。` +
      '\n直したいところがあれば、このスレッドに返信するだけで編集できます。',
  );
  gates.set(message.id, { projectId, approved: false });
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
  if (full.emoji.name !== APPROVAL_EMOJI) return;

  const users = await full.users.fetch();
  const votes = users.filter((u) => !u.bot).size;
  if (votes < REQUIRED_VOTES) return;

  gate.approved = true;
  const channel = full.message.channel;
  if (channel.isThread()) {
    await channel.send(
      `🚀 ${APPROVAL_EMOJI} が ${REQUIRED_VOTES}票集まりました!このバージョンの本番公開が承認されました 🎉`,
    );
  }
}
