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
} from './constants';
import type { Modifiers } from './types';

export const DEFAULT_MODIFIERS: Modifiers = {
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
};

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
 */
export function applyExclusions(modifiers: Modifiers): Modifiers {
  if (modifiers.switching && modifiers.oneTrack) {
    return { ...modifiers, switching: false };
  }
  return modifiers;
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
  });
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
  if (modifiers.speed !== 1) keys.push('speed');
  return keys;
}
