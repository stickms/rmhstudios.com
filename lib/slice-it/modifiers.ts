/**
 * Slice It — the modifier contract.
 *
 * One schema, used by the lobby handler, the score endpoint and the client's
 * own settings. The old code had three separate hand-rolled coercions of the
 * same object (`update_difficulty` in the socket handler, an untyped `modifiers`
 * blob on the score route, and the Zustand store's defaults) which is three
 * chances for "speed" to mean something different depending on which door the
 * value came in through.
 *
 * Every field **clamps rather than rejects**, deliberately. These values reach
 * the server from a lobby settings panel a player is dragging around; an
 * out-of-range number is a stale client or a rounding artefact, not an attack,
 * and hanging up on it would drop someone mid-lobby. What the clamp guarantees
 * is that whatever lands in the database or on another player's screen is
 * inside the range the game actually supports.
 */

import { z } from 'zod';
import {
  DIFFICULTIES,
  MAX_SPEED,
  MIN_SPEED,
  MULTIPLAYER_MIN_SPEED,
  type Difficulty,
  type VisibilityMode,
} from './constants';
import type { Modifiers } from './types';

/**
 * `satisfies Modifiers`, not `: Modifiers` — the two optional fields
 * (`lenientTiming`, `perfectionist`) are `?:` on the type so a persisted blob
 * from before they existed keeps loading, but that same optionality would
 * leak into every reader of `{ ...DEFAULT_MODIFIERS }` (the `.catch()` below,
 * `store.ts`'s initial state, `normalizeModifiers`'s fallback) if this were
 * annotated `: Modifiers`: TypeScript widens a spread to the *declared* type
 * of its source, so `lenientTiming` would read back out as `boolean |
 * undefined` even though the literal below always sets it. `satisfies` keeps
 * the literal's own — fully required — inferred shape while still checking it
 * against `Modifiers`.
 */
export const DEFAULT_MODIFIERS = {
  invisible: false,
  speed: 1.0,
  suddenDeath: false,
  bombs: false,
  switching: false,
  spin: false,
  strictTiming: false,
  oneTrack: false,
  // Off. The gauge is a thing a player asks for, never a thing that happens to
  // them — a run that can end early is a different game, and the default has to
  // be the one where finishing the song is guaranteed.
  healthGauge: false,
  difficulty: 'normal',
  // A9 / M6 — both off by default, same reasoning as `healthGauge` above: a run
  // that plays on different windows, or that can end on a GREAT, is a thing a
  // player opts into.
  lenientTiming: false,
  perfectionist: false,
  noFail: false,
  assist: false,
  sRandom: false,
  tapHolds: false,
} satisfies Modifiers;

/**
 * Every field is `.optional()` before its transform, and that is load-bearing.
 *
 * In zod v4 a bare `z.unknown()` inside `z.object()` produces a **required**
 * key — the v3 behaviour, where `unknown` made a key optional, was dropped.
 * Without `.optional()`, parsing a partial object (`{ speed: 1.5 }`, or a
 * `modifiers` blob stored before some flag existed) fails the whole object,
 * the outer `.catch()` swallows the failure, and every field silently reverts
 * to its default — including the one the caller was setting.
 */
const optionalUnknown = z.unknown().optional();

/** Speed, rounded to the 0.1 steps the slider offers and clamped to range. */
const SpeedZ = optionalUnknown.transform((raw) => {
  const n = typeof raw === 'number' && Number.isFinite(raw) ? raw : 1;
  const stepped = Math.round(n * 10) / 10;
  return Math.min(MAX_SPEED, Math.max(MIN_SPEED, stepped));
});

const BoolZ = optionalUnknown.transform((raw) => raw === true);

const DifficultyZ = optionalUnknown.transform((raw): Difficulty =>
  typeof raw === 'string' && (DIFFICULTIES as readonly string[]).includes(raw)
    ? (raw as Difficulty)
    : 'normal',
);

/**
 * Parses anything into a valid {@link Modifiers}.
 *
 * `.catch()` on the outer object covers a payload that is not an object at all
 * — `null`, a string, an array — which the previous socket handler also
 * tolerated by falling back to defaults.
 */
export const ModifiersZ: z.ZodType<Modifiers> = z
  .object({
    invisible: BoolZ,
    speed: SpeedZ,
    suddenDeath: BoolZ,
    bombs: BoolZ,
    switching: BoolZ,
    spin: BoolZ,
    strictTiming: BoolZ,
    oneTrack: BoolZ,
    healthGauge: BoolZ,
    difficulty: DifficultyZ,
    // A9 / M6 — `BoolZ` already defaults a missing or malformed key to `false`
    // (see its definition above), which is exactly the safe-when-absent
    // behaviour a new field needs to avoid a `store.ts` migration.
    lenientTiming: BoolZ,
    perfectionist: BoolZ,
    noFail: BoolZ,
    assist: BoolZ,
    sRandom: BoolZ,
    tapHolds: BoolZ,
  })
  .catch(() => ({ ...DEFAULT_MODIFIERS }));

/**
 * Coerce an arbitrary value into a valid modifier set.
 *
 * Prefer this over `ModifiersZ.parse` at call sites that already have a
 * `try`-free style — it cannot throw.
 */
export function normalizeModifiers(raw: unknown): Modifiers {
  const parsed = ModifiersZ.safeParse(raw);
  return parsed.success ? applyExclusions(parsed.data) : { ...DEFAULT_MODIFIERS };
}

/**
 * Switching moves notes between lanes; One Track collapses both lanes into one.
 * Enabling both asks the chart to do two contradictory things, and the engine
 * resolves it by silently ignoring one — so resolve it here instead, where the
 * player's most recent intent is still visible.
 *
 * A9 — Strict and Lenient Timing are opposite ends of the same knob
 * (`scoring.ts` `timingScale` already breaks the tie strict-first if both
 * somehow arrive true), so holding both is resolved here the same way: the
 * loser is turned off rather than left silently inert, so a badge or a toggle
 * showing "on" is never lying about what the run is actually doing.
 *
 * M6 — Perfectionist (anything below PERFECT ends the run) strictly implies
 * Sudden Death (anything at MISS ends the run): every condition that fails a
 * Sudden Death run also fails a Perfectionist one. Holding both would pay the
 * "one mistake ends it" bonus twice for the one exclusion group, so Sudden
 * Death is dropped — Perfectionist is the strictly harder claim, and keeps
 * its own, larger bonus (`MODIFIER_BONUSES.perfectionist`).
 */
export function applyExclusions(modifiers: Modifiers): Modifiers {
  let result = modifiers;
  if (result.switching && result.oneTrack) {
    result = { ...result, switching: false };
  }
  if (result.strictTiming && result.lenientTiming) {
    result = { ...result, lenientTiming: false };
  }
  if (result.perfectionist && result.suddenDeath) {
    result = { ...result, suddenDeath: false };
  }
  // A1 — No Fail says "nothing ends this run early"; Sudden Death and
  // Perfectionist say the opposite. The assist wins rather than the challenge:
  // a player who ticked No Fail asked for a run they can finish, and silently
  // honouring the mod that ends it at note one would be the cruellest possible
  // reading of the two.
  if (result.noFail) {
    result = { ...result, suddenDeath: false, perfectionist: false };
  }
  return result;
}

/**
 * A1 — the assist family.
 *
 * These make the game easier and are worth NOTHING. They are deliberately
 * absent from `MODIFIER_BONUSES` and they make a run unranked, and those are
 * two different statements: unranked because a widened window or a removed fail
 * state is not comparable to a run without one, not because using them is
 * illegitimate. A mod that eases the game and then charges a score penalty
 * punishes the player for needing it, which is the design mistake this list
 * exists to avoid.
 */
export const ASSIST_MODIFIERS = [
  'noFail',
  'assist',
  'lenientTiming',
  'tapHolds',
] as const satisfies readonly (keyof Modifiers)[];

/** True when a run's settings allow it onto a leaderboard at all. */
export function isRankedModifierSet(modifiers: Partial<Modifiers>): boolean {
  return !ASSIST_MODIFIERS.some((key) => modifiers[key] === true);
}

/**
 * Modifiers as a multiplayer lobby will accept them.
 *
 * Slowing the chart down is banned in a race: two players hearing the same song
 * at different rates are not competing at the same thing, and the score
 * multiplier only rewards going *faster*, so a 0.5x seat is a free easy mode.
 * Sudden Death is likewise dropped — dying at 12 seconds and then watching four
 * minutes of other people's scores is not a game mode anyone chose.
 *
 * The **health gauge survives that same reasoning rather than failing it**, and
 * is deliberately left on. It is not stripped here because it does not have to
 * be: the gauge is only a fail state where the engine says it is, and in a match
 * the engine clamps it to `'survive'` (see `GameEngine.setMultiplayer`). Draining
 * to zero in a race costs the run its multiplier bonus and nothing else, so a
 * player who wants the tension can race with it and nobody ends up spectating.
 */
export function forMultiplayer(modifiers: Modifiers): Modifiers {
  return applyExclusions({
    ...modifiers,
    speed: Math.max(MULTIPLAYER_MIN_SPEED, modifiers.speed),
    suddenDeath: false,
    // M6 — Perfectionist is dropped for exactly the reason Sudden Death is:
    // ending a race at note one and then spectating four minutes of other
    // people's scores is not a mode anyone chose by ticking a box.
    perfectionist: false,
  });
}

/**
 * M3 — the visibility family's shared alpha curve.
 *
 * `invisible` used to be one hard-coded fade; the genre has four distinct
 * mods that train different reading skills. They stay ONE `Modifiers` field
 * (`invisible: boolean`) rather than four, and deliberately do not touch
 * `types.ts` or `MODIFIER_BONUSES`: which *visual* is playing is a rendering
 * choice, not a difficulty choice, so it is a separate persisted setting
 * (`visibilityMode` in `store.ts`) layered on top of the SAME `invisible`
 * flag and the SAME 0.2 bonus every variant already earned.
 *
 * `travelRatio` is 1.0 at spawn and 0.0 at the judgement line — the domain
 * `GameCanvas.tsx` already computed for the old fade-only implementation.
 * One function, four `case`s, so a fifth mode is one more branch rather than
 * a second render path that can quietly drift from the first.
 */
export function visibilityAlpha(
  travelRatio: number,
  mode: VisibilityMode,
  /** V10 — the lane cover's height, 0 (no cover) to `MAX_LANE_COVER`. */
  coverFraction: number,
): number {
  switch (mode) {
    case 'fadeIn':
      // Invisible at spawn, fades in on approach (IIDX SUDDEN+): the opposite
      // read to fadeOut, testing a late read instead of a memorised one.
      if (travelRatio > 0.55) return 0;
      if (travelRatio > 0.35) return 1 - (travelRatio - 0.35) / 0.2;
      return 1;
    case 'flashlight':
      // Only a narrow ring around the judgement line is ever visible.
      return travelRatio < 0.15 ? 1 : 0;
    case 'laneCover':
      // The literal cover (V10): hidden until the note clears the covered
      // fraction of the approach. `coverFraction` is what the player drags.
      return travelRatio > 1 - coverFraction ? 0 : 1;
    case 'fadeOut':
    default:
      // The original `invisible` behaviour, preserved bit-for-bit: fully
      // visible until 20% of the approach remains, gone below 8%.
      if (travelRatio < 0.08) return 0;
      if (travelRatio < 0.2) return (travelRatio - 0.08) / 0.12;
      return 1;
  }
}

/** A compact label list for badges — only what differs from the defaults. */
export function activeModifierKeys(modifiers: Modifiers): (keyof Modifiers)[] {
  const keys: (keyof Modifiers)[] = [];
  if (modifiers.invisible) keys.push('invisible');
  if (modifiers.bombs) keys.push('bombs');
  if (modifiers.switching) keys.push('switching');
  if (modifiers.spin) keys.push('spin');
  if (modifiers.strictTiming) keys.push('strictTiming');
  if (modifiers.oneTrack) keys.push('oneTrack');
  if (modifiers.healthGauge) keys.push('healthGauge');
  if (modifiers.suddenDeath) keys.push('suddenDeath');
  if (modifiers.lenientTiming) keys.push('lenientTiming');
  if (modifiers.perfectionist) keys.push('perfectionist');
  if (modifiers.speed !== 1) keys.push('speed');
  return keys;
}

/**
 * M10 — the modifier set a given chart will actually accept.
 *
 * Boolean flags the chart names are turned OFF rather than left on-and-inert,
 * for the same reason `applyExclusions` does it: a badge or a toggle reading
 * "on" must never describe something the run is not doing. Non-boolean fields
 * (`speed`, `difficulty`) are never touched — a chart does not get to dictate
 * how fast you play it.
 */
export function legalFor(
  modifiers: Modifiers,
  map: { incompatible?: { key: string; reason: string }[] } | null | undefined,
): Modifiers {
  let out = modifiers;
  for (const { key } of map?.incompatible ?? []) {
    if (typeof out[key as keyof Modifiers] === 'boolean' && out[key as keyof Modifiers]) {
      out = { ...out, [key]: false };
    }
  }
  return applyExclusions(out);
}

/** The reason a chart gives for refusing a modifier, for the UI to show. */
export function incompatibleReason(
  key: keyof Modifiers,
  map: { incompatible?: { key: string; reason: string }[] } | null | undefined,
): string | null {
  return map?.incompatible?.find((entry) => entry.key === key)?.reason ?? null;
}
