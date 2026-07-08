// Pure reaction helpers shared by server payload mapping and client
// optimistic updates. No prisma imports — keep this file client-safe.

export interface ReactionSummary {
  emoji: string;
  count: number;
  reactedByMe: boolean;
}

export interface ReactionRow {
  emoji: string;
  userId: string;
}

export const MAX_REACTION_EMOJI_LENGTH = 32;

// \p{RGI_Emoji} (property-of-strings, needs the v flag) matches exactly one
// well-formed emoji including ZWJ families, flags, keycaps, and skin tones.
// Constructed lazily via new RegExp so bundlers/older engines that can't
// parse a v-flag literal don't fail at module load; falls back to a looser
// pictographic check where the v flag is unsupported.
let rgiEmojiRegex: RegExp | null | undefined;
function getRgiEmojiRegex(): RegExp | null {
  if (rgiEmojiRegex === undefined) {
    try {
      rgiEmojiRegex = new RegExp(String.raw`^\p{RGI_Emoji}$`, 'v');
    } catch {
      rgiEmojiRegex = null;
    }
  }
  return rgiEmojiRegex;
}

const FALLBACK_EMOJI_REGEX =
  /^[\p{Extended_Pictographic}\p{Emoji_Component}\u{FE0F}\u{200D}]+$/u;

export function isValidReactionEmoji(emoji: string): boolean {
  if (!emoji || emoji.length > MAX_REACTION_EMOJI_LENGTH) return false;
  const rgi = getRgiEmojiRegex();
  if (rgi) return rgi.test(emoji);
  return FALLBACK_EMOJI_REGEX.test(emoji);
}

export function groupReactions(
  rows: ReactionRow[],
  viewerId: string | null,
): ReactionSummary[] {
  const byEmoji = new Map<string, { count: number; reactedByMe: boolean }>();
  for (const row of rows) {
    const entry = byEmoji.get(row.emoji) ?? { count: 0, reactedByMe: false };
    entry.count += 1;
    if (viewerId !== null && row.userId === viewerId) entry.reactedByMe = true;
    byEmoji.set(row.emoji, entry);
  }
  return [...byEmoji.entries()]
    .map(([emoji, entry]) => ({ emoji, ...entry }))
    .sort((a, b) => b.count - a.count);
}

/** Optimistically toggle the viewer's reaction in a grouped summary list. */
export function applyReactionToggle(
  reactions: ReactionSummary[],
  emoji: string,
): ReactionSummary[] {
  const existing = reactions.find((r) => r.emoji === emoji);
  if (!existing) {
    return [...reactions, { emoji, count: 1, reactedByMe: true }];
  }
  return reactions
    .map((r) => {
      if (r.emoji !== emoji) return r;
      return r.reactedByMe
        ? { ...r, count: r.count - 1, reactedByMe: false }
        : { ...r, count: r.count + 1, reactedByMe: true };
    })
    .filter((r) => r.count > 0);
}
