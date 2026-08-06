/**
 * Slice It — chart preparation.
 *
 * Turning a stored `BeatMap` into the exact list of notes a run will play:
 * picking the difficulty variant, then applying the modifiers that rewrite the
 * chart itself (Bombs, Switching, One Track).
 *
 * ## Why this is deterministic
 *
 * The old engine placed bombs and lane-switches with bare `Math.random()`,
 * inside `loadMap`, on each client. In single player that is merely a chart you
 * cannot practise — retrying the same song gave you different bombs. In
 * multiplayer it is a fairness bug: everyone in the lobby raced *different*
 * charts and compared scores anyway. Here the conversions run through a seeded
 * PRNG keyed by `(songId, difficulty, modifiers)`, so the same settings always
 * produce the same chart — on a retry, and on every machine in a lobby.
 */

import { BOMB_CONVERSION_RATE, SWITCH_CONVERSION_RATE, type Difficulty } from './constants';
import type { BeatMap, Modifiers, Slice } from './types';

/** mulberry32 seeded from a string — small, fast, and stable across engines. */
export function createSeededRandom(seed: string): () => number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0;
  }
  return () => {
    h |= 0;
    h = (h + 0x6d2b79f5) | 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The seed a run's chart is generated from. Every input that changes the chart
 * is in it, and nothing else is — so two players who chose the same settings
 * get the same notes, and a retry reproduces the run you just lost.
 */
export function chartSeed(songId: string, modifiers: Modifiers): string {
  return [
    songId,
    modifiers.difficulty,
    modifiers.bombs ? 'b' : '-',
    modifiers.switching ? 's' : '-',
    modifiers.oneTrack ? 'o' : '-',
  ].join(':');
}

/**
 * Pick the note list for a difficulty.
 *
 * Charts are stored in two shapes: a flat array (everything generated before
 * per-difficulty charts existed) and a record keyed by difficulty. Both are
 * still in the `Song` table, so both have to keep loading.
 */
export function resolveSlices(map: BeatMap, difficulty: Difficulty): Slice[] {
  const source = map.slices;
  if (Array.isArray(source)) return source.map((s) => ({ ...s }));

  const byDifficulty = source as Partial<Record<Difficulty, Slice[]>>;
  const picked = byDifficulty[difficulty] ?? byDifficulty.normal;
  if (!Array.isArray(picked)) return [];
  return picked.map((s) => ({ ...s }));
}

/**
 * Apply the chart-rewriting modifiers.
 *
 * Order matters and is not arbitrary:
 *
 * 1. **One Track** first, because collapsing to a single lane changes which
 *    notes a later switch would collide with.
 * 2. **Switching**, which needs to know where LONG notes sit so it never sends
 *    a note into a lane that is mid-hold — an unhittable note.
 * 3. **Bombs** last, so a note that just became a SWITCH is not also a bomb.
 */
export function applyChartModifiers(
  slices: Slice[],
  modifiers: Modifiers,
  random: () => number,
): Slice[] {
  let out = slices;

  if (modifiers.oneTrack) {
    out = out.map((slice) => ({ ...slice, lane: 0 }));
  }

  if (modifiers.switching && !modifiers.oneTrack) {
    const longNotes = out.filter((s) => s.type === 'LONG');
    out = out.map((slice) => {
      if (slice.type === 'BOMB' || slice.type === 'LONG') return slice;
      if (random() >= SWITCH_CONVERSION_RATE) return slice;

      const destLane = slice.lane === 0 ? 1 : 0;
      // A small buffer either side, so a switch never lands in the fraction of
      // a second before or after a hold where the lane is effectively occupied.
      const buffer = 0.1;
      const conflicts = longNotes.some(
        (long) =>
          long.lane === destLane &&
          slice.time >= long.time - buffer &&
          slice.time <= long.time + (long.duration ?? 0) + buffer,
      );
      if (conflicts) return slice;
      return { ...slice, type: 'SWITCH' as const, duration: undefined };
    });
  }

  if (modifiers.bombs) {
    out = out.map((slice) => {
      if (slice.type === 'SWITCH' || slice.type === 'LONG') return slice;
      if (random() >= BOMB_CONVERSION_RATE) return slice;
      return { ...slice, type: 'BOMB' as const, duration: undefined };
    });
  }

  return out;
}

/**
 * The whole preparation, in one call: resolve the difficulty variant, then
 * rewrite it under the run's modifiers with a seed derived from both.
 */
export function prepareChart(map: BeatMap, modifiers: Modifiers): Slice[] {
  const base = resolveSlices(map, modifiers.difficulty);
  const random = createSeededRandom(chartSeed(map.id, modifiers));
  return applyChartModifiers(base, modifiers, random).map((slice) => ({
    ...slice,
    hit: false,
    hitTime: undefined,
  }));
}

/**
 * M1 — Mirror. Swap lanes across the whole chart.
 *
 * No difficulty change, so **no score bonus** — see `constants.ts`
 * `MODIFIER_BONUSES`, which deliberately has no `mirror` entry. Mirror is not
 * harder, and paying for it would make it a free multiplier on every chart.
 * Its value is that it turns every chart into a second chart for practice and
 * breaks memorised muscle patterns.
 *
 * Generalised over `keys` for when a wider layout (`G2`) exists; today's game
 * is always 2K, where this is exactly `1 - lane`.
 *
 * Not wired into `applyChartModifiers`/`prepareChart`: the chart those feed
 * is the one `GameEngine.loadMap` judges against, and rewriting it here would
 * need a change to `engine.ts`, owned by another agent this wave. The live
 * game gets the same *effect* — a note that started life in lane L is both
 * drawn in, and only hittable from, the opposite visual position — via an
 * equivalent bijective flip applied at the render/input boundary in
 * `GameCanvas.tsx` (`mirrorLane`), which never has to touch the chart or the
 * engine at all. This function is the reference transform: covered by its own
 * tests, and there for a future caller that prepares the chart itself (a
 * server-side render, a replay, or `engine.ts` if a later wave wires it in
 * directly).
 */
export function applyMirror(slices: Slice[], keys: number): Slice[] {
  return slices.map((s) => ({ ...s, lane: keys - 1 - s.lane }));
}

/** Notes that count toward accuracy — bombs and silent notes never do. */
export function scorableNoteCount(slices: Slice[]): number {
  return slices.filter((s) => s.type !== 'BOMB' && s.type !== 'SILENT').length;
}
