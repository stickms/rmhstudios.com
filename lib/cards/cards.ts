/**
 * Trading cards, as pure rules: how many drops a title has earned, which card a
 * drop is, what a badge craft is worth. No I/O, client-safe. The server module
 * (`cards.server.ts`) applies these under a transaction; see
 * docs/superpowers/specs/2026-10-30-trading-cards-design.md.
 */

export const SET_SIZE = 6;
export const MAX_DROPS_PER_TITLE = 3;
export const DROP_EVERY_SECONDS = 30 * 60;
export const FOIL_ONE_IN = 20;
export const MAX_BADGE_LEVEL = 5;
export const BADGE_XP = 100;
export const BADGE_XP_FOIL = 400;

/** FNV-1a, 32-bit: small, stable and good enough to spread ids over a set. */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** One drop per 30 minutes of credited play, never more than three per title. */
export function dropsEarned(totalSeconds: number): number {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) return 0;
  return Math.min(MAX_DROPS_PER_TITLE, Math.floor(totalSeconds / DROP_EVERY_SECONDS));
}

/** A seeded shuffle of 0..n-1 (Fisher-Yates over a hash-driven stream). */
function permutation(n: number, seed: string): number[] {
  const out = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = hash(`${seed}:${i}`) % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Which card drop number `dropIndex` is for this user and title. The cards come
 * from a per-user permutation of the set, so one user's drops are distinct, and the
 * answer never changes, so replaying cannot reroll it.
 */
export function dropForIndex(
  userId: string,
  gameId: string,
  dropIndex: number,
): { cardIndex: number; foil: boolean } {
  const cardIndex = permutation(SET_SIZE, `${userId}|${gameId}`)[dropIndex % SET_SIZE];
  const foil = hash(`foil|${userId}|${gameId}|${dropIndex}`) % FOIL_ONE_IN === 0;
  return { cardIndex, foil };
}

const NAME_POOL = [
  'The Opening',
  'The Rival',
  'The Relic',
  'The Pursuit',
  'The Breakthrough',
  'The Hazard',
  'The Ally',
  'The Finale',
] as const;

/** A card's name: a per-title selection from the pool, unique within the set. */
export function cardName(gameId: string, cardIndex: number): string {
  const order = permutation(NAME_POOL.length, `names|${gameId}`);
  return NAME_POOL[order[((cardIndex % SET_SIZE) + SET_SIZE) % SET_SIZE]];
}

export type CraftPlan =
  | { ok: true; newLevel: number; xp: number }
  | { ok: false; reason: 'missing-cards' | 'max-level' };

/** Whether a badge can be crafted from these counts (one per card, in set order). */
export function planCraft(input: { counts: number[]; level: number; foil: boolean }): CraftPlan {
  const { counts, level, foil } = input;
  if (counts.length !== SET_SIZE || counts.some((c) => !(c >= 1))) {
    return { ok: false, reason: 'missing-cards' };
  }
  const max = foil ? 1 : MAX_BADGE_LEVEL;
  if (level >= max) return { ok: false, reason: 'max-level' };
  return { ok: true, newLevel: level + 1, xp: foil ? BADGE_XP_FOIL : BADGE_XP };
}
