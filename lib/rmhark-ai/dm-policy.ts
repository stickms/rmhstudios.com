/**
 * Pure decision logic for bot direct messages — no Prisma, no I/O, no DeepSeek.
 * Side-effect-free so it is unit-testable and reused by the bot-worker dmTick.
 */

export type DmPrivacy = 'EVERYONE' | 'FOLLOWERS' | 'NONE';

/** Minimal shape of a direct message the policy functions reason about. */
export interface PolicyMessage {
  senderId: string;
  createdAt: Date;
}

/** A direct message with its text, used when formatting history for the model. */
export interface DmMessage {
  senderId: string;
  content: string;
}

/** One labeled turn of a DM conversation, from the bot's point of view. */
export interface DmTurn {
  from: 'them' | 'you';
  text: string;
}

/**
 * Whether a bot owes a reactive reply: true when there is at least one message
 * and the most recent one is NOT from the bot (the human spoke last).
 * `messages` must be ordered oldest-first.
 */
export function needsReactiveReply(messages: PolicyMessage[], botId: string): boolean {
  if (messages.length === 0) return false;
  return messages[messages.length - 1].senderId !== botId;
}

/**
 * Whether a bot may send the FIRST message to a human, per the human's DM
 * privacy. Mirrors app/routes/api/messages.ts.
 */
export function canBotMessage(opts: { dmPrivacy: DmPrivacy; humanFollowsBot: boolean }): boolean {
  switch (opts.dmPrivacy) {
    case 'NONE':
      return false;
    case 'FOLLOWERS':
      return opts.humanFollowsBot;
    case 'EVERYONE':
      return true;
    default:
      return false;
  }
}

export type InitiationDecision = 'opener' | 'followup' | 'skip';

/**
 * Decide whether a bot may initiate (or follow up) with a human, given the
 * existing conversation's messages (oldest-first), or null if none exists.
 *
 *  - No conversation            -> 'opener'
 *  - Human has ever replied     -> 'skip' (active; reactive path handles it)
 *  - One unanswered bot opener  -> 'followup' once enough silence elapsed, else 'skip'
 *  - Two+ unanswered bot msgs   -> 'skip' (give up; never pester further)
 */
export function decideInitiation(opts: {
  botId: string;
  now: number;
  followupSilenceMs: number;
  messages: PolicyMessage[] | null;
}): InitiationDecision {
  const { botId, now, followupSilenceMs, messages } = opts;
  if (!messages || messages.length === 0) return 'opener';

  const humanReplied = messages.some((m) => m.senderId !== botId);
  if (humanReplied) return 'skip';

  if (messages.length >= 2) return 'skip';

  const last = messages[messages.length - 1];
  return now - last.createdAt.getTime() >= followupSilenceMs ? 'followup' : 'skip';
}

/** Label conversation messages as them/you for the model prompt (order preserved). */
export function formatDmHistory(messages: DmMessage[], botId: string): DmTurn[] {
  return messages.map((m) => ({
    from: m.senderId === botId ? 'you' : 'them',
    text: m.content,
  }));
}
