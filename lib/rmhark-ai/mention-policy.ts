/**
 * Pure decision logic for bot @mention replies — no Prisma, no I/O, no DeepSeek.
 * Side-effect-free so it is unit-testable, mirroring dm-policy.ts.
 */

/**
 * Given whether each comment author is a bot, walking from the thread tip (most
 * recent) toward the root, return the length of the leading run of bot authors.
 * Stops at the first human. Used to cap bot↔bot @mention ping-pong.
 *
 *   [true, true, false, true] -> 2
 *   [false, ...]              -> 0
 *   []                        -> 0
 */
export function consecutiveBotDepth(tipToRootIsBot: boolean[]): number {
  let depth = 0;
  for (const isBot of tipToRootIsBot) {
    if (!isBot) break;
    depth++;
  }
  return depth;
}

/**
 * Whether a bot should answer a mention. Humans are always answered. A mention
 * authored by a bot is answered only while the bot↔bot chain at the thread tip
 * is shorter than `maxBotMentionDepth`.
 */
export function shouldReplyToMention(opts: {
  actorIsBot: boolean;
  botChainDepth: number;
  maxBotMentionDepth: number;
}): boolean {
  if (!opts.actorIsBot) return true;
  return opts.botChainDepth < opts.maxBotMentionDepth;
}
