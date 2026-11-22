/**
 * Void Breaker: what an assist profile (`lib/game/assist.ts`) does to a run.
 *
 * Pure and client-safe. The server decides which runs are assisted at run start
 * (`POST /api/games/void-breaker/assist-run`); this file maps the profile it
 * hands back onto the engine's levers, so the mapping can be read and tested
 * without a canvas.
 *
 *   speedFloor    scales simulation time (movement, enemies, projectiles, timers)
 *   noTimedInput  the countdown, the breather between waves and narrative lines
 *                 wait for the player (Enter); the combo window never lapses
 *   calmVisuals   no screen shake, hit flashes, boss-death flash, lightning
 *                 strobe, invulnerability blink or pulsing glows
 *   colorSafe     every enemy and pickup type also carries an outline pattern and
 *                 a letter, drawn over either renderer
 *   holdToPress   a held ability key repeats the ability whenever it is ready
 *                 (the weapon already fires on its own)
 */

import type { AssistProfile } from '@/lib/game/assist';
import type { EnemyType } from './types';

export interface VoidBreakerAssistFlags {
  active: boolean;
  clockScale: number;
  calm: boolean;
  colorSafe: boolean;
  holdRepeat: boolean;
  untimed: boolean;
}

export const NO_ASSIST_FLAGS: VoidBreakerAssistFlags = {
  active: false,
  clockScale: 1,
  calm: false,
  colorSafe: false,
  holdRepeat: false,
  untimed: false,
};

/** A ranked profile (or none) is the plain game. */
export function voidBreakerAssistFlags(profile: AssistProfile | null | undefined): VoidBreakerAssistFlags {
  if (!profile || profile.ranked) return NO_ASSIST_FLAGS;
  return {
    active: true,
    clockScale: Math.min(1, Math.max(0.5, profile.speedFloor)),
    calm: profile.calmVisuals,
    colorSafe: profile.colorSafe,
    holdRepeat: profile.holdToPress,
    untimed: profile.noTimedInput,
  };
}

/** Simulation seconds for a frame of `dt` real seconds. */
export function scaledDt(dt: number, flags: VoidBreakerAssistFlags): number {
  return dt * flags.clockScale;
}

/**
 * Whether an ability key triggers this frame: a fresh press always does; a held
 * key does too under hold-to-press (cooldowns still gate the ability itself).
 */
export function abilityTriggers(pressed: boolean, wasPressed: boolean, flags: VoidBreakerAssistFlags): boolean {
  return pressed && (flags.holdRepeat || !wasPressed);
}

/** The time stamp a hit flash lasts until, or 0 (no flash) under calm visuals. */
export function hitFlashUntil(elapsedMs: number, flags: VoidBreakerAssistFlags): number {
  return flags.calm ? 0 : elapsedMs + 80;
}

/** Whether the combo window lapses with time. */
export function comboLapses(flags: VoidBreakerAssistFlags): boolean {
  return !flags.untimed;
}

/** One enemy or pickup type's mark: a dash pattern for the outline and a letter. */
export interface TypeMark {
  letter: string;
  /** Outline dash pattern in px (empty = solid). */
  dash: readonly number[];
}

export const ENEMY_MARKS: Readonly<Record<EnemyType, TypeMark>> = {
  drifter: {
    letter: 'D',
    dash: [],
  },
  dasher: {
    letter: 'A',
    dash: [6, 3],
  },
  orbiter: {
    letter: 'O',
    dash: [2, 3],
  },
  tank: {
    letter: 'T',
    dash: [10, 4],
  },
  splitter: {
    letter: 'S',
    dash: [6, 3, 2, 3],
  },
  mini_drifter: {
    letter: 'm',
    dash: [3, 6],
  },
  sniper: {
    letter: 'N',
    dash: [12, 3, 2, 3],
  },
  healer: {
    letter: 'H',
    dash: [2, 8],
  },
  shielded: {
    letter: 'L',
    dash: [14, 5],
  },
  hive: {
    letter: 'V',
    dash: [4, 2, 4, 6],
  },
  bomber: {
    letter: 'B',
    dash: [8, 2, 2, 2],
  },
};

export const BOSS_MARK: TypeMark = {
  letter: '!',
  dash: [],
};
export const SHARD_MARK: TypeMark = {
  letter: '◆',
  dash: [3, 3],
};
export const HEART_MARK: TypeMark = {
  letter: '+',
  dash: [],
};

export function enemyMark(type: EnemyType, isBoss: boolean): TypeMark {
  return isBoss ? BOSS_MARK : ENEMY_MARKS[type];
}
