/**
 * Watch-party bingo — pure and client-safe.
 * Feature idea T2 in docs/plans/2026-10-12-feature-ideas-every-surface.md.
 *
 * Stream bingo is the oldest second-screen game there is: the host (or the
 * room) writes a pool of things that might happen — "buffering", "someone
 * says 'wait go back'", "the villain monologues" — each viewer gets a
 * different 5×5 card drawn from the pool, the host calls squares as they
 * happen, and the first full line wins.
 *
 * The card is a pure function of (pool, room seed, userId), so the server
 * never stores cards: any client can regenerate any card for verification,
 * and a viewer who reloads gets the same card back. The host's calls are the
 * only state the room has to sync, and a win is verified server-side by
 * regenerating the claimant's card and checking it against those calls —
 * the client's claim of a line is never trusted.
 */

export const SIZE = 5;
const CELLS = SIZE * SIZE;
const FREE = Math.floor(CELLS / 2);

export interface BingoCard {
  /** Row-major, length 25. The centre is the free square (`null`). */
  cells: (string | null)[];
}

function hash32(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Distinct, trimmed, non-empty pool entries. A card needs 24. */
export function normalizePool(pool: readonly string[]): string[] {
  return [...new Set(pool.map((p) => p.trim()).filter(Boolean))];
}

export function makeCard(
  pool: readonly string[],
  roomSeed: string,
  userId: string,
): BingoCard | null {
  const items = normalizePool(pool);
  if (items.length < CELLS - 1) return null;
  const rand = rng(hash32(`${roomSeed}:${userId}`));
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [items[i], items[j]] = [items[j]!, items[i]!];
  }
  const picks = items.slice(0, CELLS - 1);
  const cells: (string | null)[] = [...picks.slice(0, FREE), null, ...picks.slice(FREE)];
  return { cells };
}

/** Every line: 5 rows, 5 columns, 2 diagonals — as cell indexes. */
export const LINES: readonly (readonly number[])[] = (() => {
  const out: number[][] = [];
  for (let r = 0; r < SIZE; r++) out.push(Array.from({ length: SIZE }, (_, c) => r * SIZE + c));
  for (let c = 0; c < SIZE; c++) out.push(Array.from({ length: SIZE }, (_, r) => r * SIZE + c));
  out.push(Array.from({ length: SIZE }, (_, i) => i * SIZE + i));
  out.push(Array.from({ length: SIZE }, (_, i) => i * SIZE + (SIZE - 1 - i)));
  return out;
})();

/** Lines completed by the host's `called` squares (the free square always counts). */
export function completedLines(card: BingoCard, called: ReadonlySet<string>): number[][] {
  const marked = (i: number) => {
    const v = card.cells[i];
    return v === null || (v !== undefined && called.has(v));
  };
  return LINES.filter((line) => line.every(marked)).map((l) => [...l]);
}

/** Server-side win check: regenerate the card, never trust the client's. */
export function verifyBingo(
  pool: readonly string[],
  roomSeed: string,
  userId: string,
  called: ReadonlySet<string>,
): boolean {
  const card = makeCard(pool, roomSeed, userId);
  return !!card && completedLines(card, called).length > 0;
}
