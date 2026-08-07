/**
 * Slice It — replay capture, the vocabulary bridge (`R3`/`R4`).
 *
 * `lib/game/replay.ts` has held a complete Slice It replay contract — a schema,
 * a size cap, a `verifySliceIt` re-simulation and a registry entry — since the
 * platform-expansion work, and until now **nothing in `lib/slice-it/` referenced
 * any of it**. The verifier was written; the game never produced its input. This
 * module is the missing half: the pure, client-safe translation between what the
 * engine judges and what the cross-game schema stores.
 *
 * ## Two vocabularies, and why we map rather than widen
 *
 * The engine judges in six values (`MARVELOUS … MISS`, see
 * `constants.ts#HIT_RESULTS`). The shared schema's enum is four
 * (`perfect/great/good/miss`). `lib/game/replay.ts` is cross-game — Lights Out
 * reads the same module, the speedrun verifier imports its versions, and
 * `GameReplay.version` rows already exist under `si-1` semantics — so its enum is
 * a **contract**, not an implementation detail of this game. Widening it to six
 * would make every other consumer's `switch` non-exhaustive to buy Slice It a
 * distinction only Slice It can use.
 *
 * So the map is lossy on purpose, and lossy in exactly two places:
 * `MARVELOUS`/`PERFECT` both store `perfect`, and `GOOD`/`BAD` both store
 * `good`. What that costs is stated in {@link REPLAY_TO_HIT_RESULT}: a played-back
 * replay shows `PERFECT` where the run showed `MARVELOUS`, and the playback
 * score is therefore a floor, not the run's score. The run's real score travels
 * beside the replay on the leaderboard row; the log is for watching and for
 * re-judging against the chart (`R8`), and neither needs the sixth value.
 *
 * ## Why a code, not a string
 *
 * The engine records on the resolution path, which is the input path, which is
 * the frame path. {@link JUDGMENT_CODE} maps a `HitResult` to a small integer so
 * the engine can append into pre-sized typed arrays and allocate nothing per
 * note — see `engine.ts#recordReplay`. Strings are materialised once, at
 * submission, by {@link buildReplayInputs}.
 */

import type { HitResult } from './constants';
import { chartSeed } from './chart';
import type { Modifiers } from './types';
import { SLICE_IT_MAX_INPUTS, type SliceItJudgment, type SliceItReplay } from '@/lib/game/replay';

/**
 * The shared schema's four judgements, in code order.
 *
 * The index into this array is what the engine stores. Order is part of the
 * recording format: changing it re-labels every in-flight run, so append only.
 */
export const REPLAY_JUDGMENTS = [
  'perfect',
  'great',
  'good',
  'miss',
] as const satisfies readonly SliceItJudgment[];

/** `-1` means "not recordable" — see {@link JUDGMENT_CODE}. */
export const NOT_RECORDED = -1;

/**
 * Engine judgement → the code stored in the replay log.
 *
 * `NONE` is the engine's "nothing was judged" value; it never reaches the log,
 * which is why the recorder tests the code rather than the result. Everything
 * else maps, and the two collapses (`MARVELOUS`→`perfect`, `BAD`→`good`) are the
 * deliberate narrowing described in the module header.
 */
export const JUDGMENT_CODE: Record<HitResult, number> = {
  MARVELOUS: 0,
  PERFECT: 0,
  GREAT: 1,
  GOOD: 2,
  BAD: 2,
  MISS: 3,
  NONE: NOT_RECORDED,
};

/**
 * The inverse, for playback (`R4`).
 *
 * Lossy by construction: nothing here can return `MARVELOUS` or `BAD`, because
 * the log does not carry the distinction. A replay therefore renders a
 * `MARVELOUS` run as a `PERFECT` one — same feedback colour family, same combo,
 * slightly lower points. That is the price of a four-value cross-game enum and
 * it is paid in the *viewer*, never in the score: the authoritative number for a
 * run is the one the leaderboard stored when it was played.
 */
export const REPLAY_TO_HIT_RESULT: Record<SliceItJudgment, HitResult> = {
  perfect: 'PERFECT',
  great: 'GREAT',
  good: 'GOOD',
  miss: 'MISS',
};

/** Decode a stored code back to the schema's judgement string. */
export function judgmentOfCode(code: number): SliceItJudgment {
  return REPLAY_JUDGMENTS[code] ?? 'miss';
}

/** Re-exported so the engine sizes its buffers from the schema's own limit. */
export const REPLAY_MAX_INPUTS = SLICE_IT_MAX_INPUTS;

/**
 * One resolution, as the shared schema stores it.
 *
 * `lane` is optional because the schema's is — the cross-game contract allows a
 * game whose inputs have no lane. Slice It's recorder always writes one; playback
 * and verification both default a missing lane to 0 rather than refusing the
 * input, because a replay from a laneless producer is still a valid timeline.
 */
export interface ReplayInput {
  /** Milliseconds into the track. */
  t: number;
  lane?: number;
  judgment: SliceItJudgment;
}

/**
 * Materialise the engine's typed-array log into the schema's object array.
 *
 * Called once, at submission — the allocation the recorder spent the whole run
 * avoiding is fine here, because the run is over.
 */
export function buildReplayInputs(
  times: Int32Array,
  lanes: Uint8Array,
  judgments: Uint8Array,
  count: number,
): ReplayInput[] {
  const capped = Math.max(0, Math.min(count, times.length));
  const out: ReplayInput[] = new Array(capped);
  for (let i = 0; i < capped; i++) {
    out[i] = { t: times[i], lane: lanes[i], judgment: judgmentOfCode(judgments[i]) };
  }
  return out;
}

/**
 * A numeric fingerprint of the run's chart seed, for the schema's `seed` field.
 *
 * The chart's real seed is a *string* — `chartSeed(songId, modifiers)` in
 * `chart.ts`, which is what makes bombs and lane-switches reproducible — and the
 * cross-game schema's `seed` is a bounded number, because Lights Out's is. So
 * the string is hashed into that range and the string's *inputs* travel
 * separately in {@link SliceItReplay.mods}. Playback reconstructs the chart from
 * the inputs and uses this only as a checksum: a mismatch means the replay was
 * recorded against a different chart than the one being rebuilt (a modifier set
 * that was edited in transit, or a chart-generation change), which is exactly
 * the case where playing it back would be a silent lie.
 *
 * FNV-1a, truncated to the schema's `0 … 99_999_999`.
 */
export function replaySeed(songId: string, modifiers: Modifiers): number {
  const seed = chartSeed(songId, modifiers);
  let hash = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash % 100_000_000;
}

/**
 * The modifier subset a replay carries.
 *
 * Not the whole {@link Modifiers} object: `invisible`, `spin` and `suddenDeath`
 * change how a run *looked* or how it could end, not which notes existed or how
 * they were judged, and a replay that re-derives its chart only needs the
 * second. `difficulty`, `bombs`, `switching` and `oneTrack` are the four inputs
 * to `chartSeed`; `speed` and `strictTiming` are the two inputs to
 * `timingScale`, which `R8` re-judges with. Everything the viewer and the
 * verifier need, and nothing they do not.
 */
export function replayMods(modifiers: Modifiers): SliceItReplay['mods'] {
  return {
    difficulty: modifiers.difficulty,
    speed: modifiers.speed,
    bombs: modifiers.bombs,
    switching: modifiers.switching,
    oneTrack: modifiers.oneTrack,
    strictTiming: modifiers.strictTiming,
  };
}

/**
 * The full modifier set implied by a replay's stored subset.
 *
 * The three cosmetic flags come back as `false` rather than as whatever the run
 * had, which is the honest reconstruction: the log does not record them, so a
 * viewer must not claim to know them. `healthGauge` is likewise off — a replay
 * of a failed run stops where the log stops, it does not re-fail.
 */
export function modsFromReplay(mods: SliceItReplay['mods']): Modifiers {
  return {
    difficulty: mods?.difficulty ?? 'normal',
    speed: mods?.speed ?? 1,
    bombs: mods?.bombs ?? false,
    switching: mods?.switching ?? false,
    oneTrack: mods?.oneTrack ?? false,
    strictTiming: mods?.strictTiming ?? false,
    invisible: false,
    spin: false,
    suddenDeath: false,
    healthGauge: false,
  };
}
