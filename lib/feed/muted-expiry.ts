/**
 * Muted words can carry an optional expiry ("mute for a week"). The words stay
 * in `UserProfile.mutedWords`; their deadlines live beside them in
 * `mutedWordExpiries` as `{ [word]: epochMs }`. A word with no entry is muted
 * until the user removes it. This file is pure so the API route, the feed read
 * and the tests share one definition of "still active".
 */

export const MUTE_DURATIONS = {
  day: 24 * 60 * 60 * 1000,
  week: 7 * 24 * 60 * 60 * 1000,
  month: 30 * 24 * 60 * 60 * 1000,
} as const;

export type MuteDuration = keyof typeof MUTE_DURATIONS;

/** No deadline may be further out than this — "forever" is the absence of one. */
export const MAX_MUTE_MS = 366 * 24 * 60 * 60 * 1000;

export type MutedExpiries = Record<string, number>;

/** Coerce whatever the JSON column holds into a clean `{ word: epochMs }` map. */
export function parseExpiries(raw: unknown): MutedExpiries {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: MutedExpiries = {};
  for (const [word, at] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof at === 'number' && Number.isFinite(at)) out[word] = at;
  }
  return out;
}

/** Words whose deadline has not passed (or that never had one). */
export function activeMutedWords(words: string[], expiries: MutedExpiries, now: number): string[] {
  return words.filter((w) => {
    const at = expiries[w];
    return at === undefined || at > now;
  });
}

/**
 * The expiry map to store for `words`: only listed words, only deadlines that
 * are still in the future and no further than {@link MAX_MUTE_MS} away.
 */
export function cleanExpiries(words: string[], expiries: MutedExpiries, now: number): MutedExpiries {
  const out: MutedExpiries = {};
  for (const w of words) {
    const at = expiries[w];
    if (at !== undefined && at > now) out[w] = Math.min(at, now + MAX_MUTE_MS);
  }
  return out;
}

/** The soonest deadline among `words`, or null when none expires. */
export function nextExpiry(words: string[], expiries: MutedExpiries): number | null {
  let soonest: number | null = null;
  for (const w of words) {
    const at = expiries[w];
    if (at !== undefined && (soonest === null || at < soonest)) soonest = at;
  }
  return soonest;
}
