/**
 * Slice It — shipping one difficulty instead of four (`O7`).
 *
 * `BeatMap.slices` is `Record<Difficulty, Slice[]>`, so the single-song read
 * delivers all four charts and the client throws three away in `resolveSlices`.
 * The list endpoint already excludes the chart entirely for exactly this reason
 * ("hundreds of kilobytes"), and the difficulties are **nested** — Easy ⊆
 * Normal ⊆ Hard ⊆ Expert — so most of what ships is the same notes four times.
 *
 * Two things live here, and they are deliberately independent:
 *
 *  1. {@link trimToDifficulty} — a wire-level trim that works on charts already
 *     in the database. The win is on the wire, not in the query: Prisma cannot
 *     `select` inside a Json column, so the read is unchanged and the response
 *     shrinks. This is the one that helps today.
 *  2. {@link packNested} / {@link unpackNested} — the representation that makes
 *     it free for new charts. Expert once, plus three bitsets over it. A
 *     1200-note Expert plus three 1200-bit masks is ~450 bytes of masks against
 *     ~200 KB of repeated note objects.
 *
 * Pure and browser-safe: the server packs, the client unpacks, and the tests
 * assert they agree.
 */

import type { Difficulty } from './constants';
import type { BeatMap, Slice } from './types';

/** Difficulty order, easiest first — the nesting direction. */
export const NESTED_ORDER: readonly Difficulty[] = ['easy', 'normal', 'hard', 'expert'];

/* ─── The wire trim ──────────────────────────────────────────────────────── */

/**
 * Return a copy of `map` carrying only one difficulty.
 *
 * A legacy flat-array chart passes through untouched — there is nothing to
 * trim, and rewriting it into a record would change the shape `resolveSlices`
 * uses to tell the two eras apart.
 *
 * A requested difficulty the chart does not have falls back to `normal` rather
 * than to an empty chart, matching `resolveSlices` exactly. Having the two
 * disagree would mean the server trimmed away the notes the client was about to
 * pick.
 */
export function trimToDifficulty(map: BeatMap, difficulty: Difficulty): BeatMap {
  if (Array.isArray(map.slices)) return map;

  const byDifficulty = map.slices as Partial<Record<Difficulty, Slice[]>>;
  const picked = byDifficulty[difficulty] ?? byDifficulty.normal;
  if (!Array.isArray(picked)) return map;

  // Keyed by the REQUESTED difficulty even when the fallback supplied the
  // notes, so the client's own `resolveSlices` finds them under the key it
  // asks for rather than falling back a second time.
  return { ...map, slices: { [difficulty]: picked } as Record<Difficulty, Slice[]> };
}

/** Rough bytes saved by trimming, for logging the win rather than assuming it. */
export function trimSavings(map: BeatMap, difficulty: Difficulty): number {
  if (Array.isArray(map.slices)) return 0;
  const full = JSON.stringify(map.slices).length;
  const trimmed = JSON.stringify(trimToDifficulty(map, difficulty).slices).length;
  return Math.max(0, full - trimmed);
}

/* ─── The nested representation ──────────────────────────────────────────── */

export interface NestedChart {
  /** The full note list. Every lower tier is a subset of this. */
  expert: Slice[];
  /** Base64 bitsets over `expert`, one per lower tier, LSB-first per byte. */
  masks: Record<'easy' | 'normal' | 'hard', string>;
}

/**
 * Pack four difficulties into Expert plus three masks.
 *
 * Returns `null` when the nesting invariant does not hold — a note in a lower
 * tier that Expert does not contain. That is a **charter bug**, and packing
 * anyway would silently delete the note. The caller keeps the four-list form,
 * which is correct if wasteful, and the linter (`C11`) is where the bug gets
 * reported.
 *
 * Identity is by `id`, not by position or by time: the charter derives lower
 * tiers by selection, so ids are preserved, and comparing by time would merge
 * two notes that share a timestamp across lanes.
 */
export function packNested(byDifficulty: Record<Difficulty, Slice[]>): NestedChart | null {
  const expert = byDifficulty.expert;
  if (!Array.isArray(expert)) return null;

  const index = new Map<string, number>();
  expert.forEach((slice, i) => index.set(slice.id, i));
  // A duplicate id in Expert makes the mask ambiguous — the second occurrence
  // overwrote the first above, so a lower tier referring to it would restore
  // the wrong note.
  if (index.size !== expert.length) return null;

  const masks = {} as NestedChart['masks'];
  for (const tier of ['easy', 'normal', 'hard'] as const) {
    const list = byDifficulty[tier];
    if (!Array.isArray(list)) return null;
    const bits = new Uint8Array(Math.ceil(expert.length / 8));
    for (const slice of list) {
      const at = index.get(slice.id);
      if (at === undefined) return null;
      bits[at >> 3] |= 1 << (at & 7);
    }
    masks[tier] = bytesToBase64(bits);
  }
  return { expert, masks };
}

/** Rebuild one difficulty's note list from a packed chart. */
export function unpackNested(chart: NestedChart, difficulty: Difficulty): Slice[] {
  if (difficulty === 'expert') return chart.expert.map((slice) => ({ ...slice }));
  const bits = base64ToBytes(chart.masks[difficulty]);
  const out: Slice[] = [];
  for (let i = 0; i < chart.expert.length; i++) {
    if (bits[i >> 3] & (1 << (i & 7))) out.push({ ...chart.expert[i] });
  }
  return out;
}

/** Rebuild every difficulty — for the editor and the linter, not for play. */
export function unpackAll(chart: NestedChart): Record<Difficulty, Slice[]> {
  return {
    easy: unpackNested(chart, 'easy'),
    normal: unpackNested(chart, 'normal'),
    hard: unpackNested(chart, 'hard'),
    expert: unpackNested(chart, 'expert'),
  };
}

/**
 * Bytes a packed chart costs against the four-list form.
 *
 * Reported rather than asserted: the saving depends on note count and on how
 * much of Expert survives into Easy, and a number in a log beats a claim in a
 * comment.
 */
export function packedSavings(byDifficulty: Record<Difficulty, Slice[]>): number {
  const packed = packNested(byDifficulty);
  if (!packed) return 0;
  return Math.max(0, JSON.stringify(byDifficulty).length - JSON.stringify(packed).length);
}

/** Whether a JSON value is a packed chart rather than the four-list form. */
export function isNestedChart(value: unknown): value is NestedChart {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<NestedChart>;
  return Array.isArray(candidate.expert) && !!candidate.masks && typeof candidate.masks === 'object';
}

function bytesToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64');
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(encoded: string): Uint8Array {
  if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(encoded, 'base64'));
  const binary = atob(encoded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}
