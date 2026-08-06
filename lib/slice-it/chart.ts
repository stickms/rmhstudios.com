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
 *
 * ## G7 — chart-native mines are opt-in, and this file is what makes them so
 *
 * `placeMines()` in `beatmap/charter.ts` writes `BOMB` slices into the *stored*
 * chart, at musical rests. They are new notes at new timestamps, not converted
 * existing ones, so the `modifiers.bombs` conversion below never sees them and
 * cannot filter them — which would make them unavoidable for every player on
 * every run, including everyone who never switched the modifier on. Bombs are
 * supposed to be a choice.
 *
 * So the gate lives here instead: {@link applyChartModifiers} **strips every
 * chart-native mine when `modifiers.bombs` is off**, before anything else runs.
 * The two halves are a pair; neither is safe alone.
 */

import { BOMB_CONVERSION_RATE, SWITCH_CONVERSION_RATE, type Difficulty } from './constants';
import type { BeatMap, Modifiers, Slice } from './types';

/* ─── G7: the chart-native mine marker ───────────────────────────────────── */

/**
 * Prefix on the `id` of a `BOMB` slice the charter placed, as opposed to one
 * the `bombs` modifier converted at play time.
 *
 * The marker is carried on `id` rather than as a new field on `Slice` for one
 * reason that outranks tidiness: `id` is the only property every path through
 * this codebase preserves. A chart is JSON in a `Json` column, is re-read
 * through several hand-written coercions (`asSlices` in `rating.server.ts`,
 * `asLintNotes` in `ranking.server.ts`, `LintNote` in `beatmap/lint.ts`), and
 * each of those rebuilds a note from a fixed list of fields. A boolean flag
 * would survive none of them; a prefix on a required field survives all of
 * them, and survives a round trip through any chart editor that does not
 * invent new ids.
 *
 * The consequence to know: a player who *renames* a note id destroys the mark.
 * Nothing in the editor does that, and the failure mode if something did is a
 * mine that behaves like a converted one — permanent rather than opt-in, which
 * is why {@link isChartNativeMine} is the only reader and it is used in exactly
 * one place.
 */
export const CHART_MINE_ID_PREFIX = 'mine:';

/** True for a `BOMB` the charter placed (G7), false for a converted note. */
export function isChartNativeMine(slice: Pick<Slice, 'id' | 'type'>): boolean {
  return (
    slice.type === 'BOMB' &&
    typeof slice.id === 'string' &&
    slice.id.startsWith(CHART_MINE_ID_PREFIX)
  );
}

/**
 * Strip chart-native mines from a note list.
 *
 * Exported for the places that need the chart *as the player will see it*
 * without preparing a whole run — the note count a difficulty advertises, a
 * preview render, a test. Converted bombs are untouched: they only exist when
 * the modifier that produced them is on.
 */
export function withoutChartMines(slices: Slice[]): Slice[] {
  return slices.filter((slice) => !isChartNativeMine(slice));
}

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
 * 0. **Chart-native mines (G7)** are dropped first when `bombs` is off, so the
 *    rest of the pipeline never sees a note the player did not agree to. Doing
 *    it first also keeps them out of the same-lane conflict scan in step 2 and
 *    out of the note stream `oneTrack` collapses.
 * 1. **One Track**, because collapsing to a single lane changes which notes a
 *    later switch would collide with.
 * 2. **Switching**, which needs to know where LONG notes sit so it never sends
 *    a note into a lane that is mid-hold — an unhittable note.
 * 3. **Bombs** last, so a note that just became a SWITCH is not also a bomb.
 *
 * The mine strip runs **before** any call to `random()`, so it cannot shift the
 * PRNG sequence: a chart with mines and the same chart without them produce
 * identical conversions for every other note. That is what keeps `bombs: false`
 * on a mined chart byte-identical to `bombs: false` on an unmined one.
 */
export function applyChartModifiers(
  slices: Slice[],
  modifiers: Modifiers,
  random: () => number,
): Slice[] {
  // G7. The whole opt-in guarantee, in one line: a mine the charter placed is
  // part of the stored chart, and the stored chart is not what gets played
  // unless the player asked for bombs.
  let out = modifiers.bombs ? slices : withoutChartMines(slices);

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
      // G7. A chart-native mine is already a bomb; converting it again is a
      // no-op that would still burn a draw from the PRNG and shift every
      // conversion after it. Skipping keeps a mined chart's converted bombs in
      // the same places an unmined chart's would be.
      if (slice.type === 'BOMB') return slice;
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
