/**
 * Slice It! achievement-unlock logic — pure and client-safe.
 *
 * Given the facts of one submitted run, decides which one-shot achievement ids
 * (defined in `lib/achievements/catalog.ts`) that run satisfies. No Prisma, no
 * side effects — the actual granting (and the coin reward that comes with it)
 * happens in `lib/slice-it/progression.server.ts`, which calls this first so
 * "did this run qualify" can be unit-tested without a database.
 *
 * Deliberately excludes the achievements that are not decided by a single run:
 * `centurion` (incremental — needs a distinct-song count across every run),
 * `upload` (fires from the song-upload route) and `charted` (fires from the
 * chart-publish route). Those are granted directly at their own call sites.
 */

import { gradeFor } from '@/lib/slice-it/scoring';
import type { Difficulty } from '@/lib/slice-it/constants';
import type { Modifiers } from '@/lib/slice-it/types';

export interface SliceItRunFacts {
  difficulty: Difficulty;
  /** 0–1. */
  accuracy: number;
  /** Did the run reach the end without the gauge killing it? */
  cleared: boolean;
  /** Client-declared, like everywhere else this flows through — see `score.ts`. */
  isFullCombo: boolean;
  modifiers: Modifiers;
}

/**
 * The boolean modifier toggles that count toward "how many modifiers are
 * active" — `speed` and `difficulty` are run configuration, not optional
 * mutators, so they are deliberately excluded.
 */
const MODIFIER_TOGGLES = [
  'invisible',
  'suddenDeath',
  'bombs',
  'switching',
  'spin',
  'strictTiming',
  'oneTrack',
  'healthGauge',
  'lenientTiming',
  'perfectionist',
] as const satisfies readonly (keyof Modifiers)[];

export function countActiveModifiers(modifiers: Modifiers): number {
  return MODIFIER_TOGGLES.reduce((n, key) => n + (modifiers[key] ? 1 : 0), 0);
}

/** `game.slice_it.stacked` — "Clear a song with four modifiers active." */
export const STACKED_MODIFIER_THRESHOLD = 4;

/**
 * One-shot achievement ids this run's facts satisfy. May return the same id
 * across many runs — `grantAchievement` is idempotent, so the caller does not
 * need to filter against what the player already has.
 */
export function sliceItAchievementsForRun(run: SliceItRunFacts): string[] {
  const ids: string[] = ['game.slice_it.first_play'];

  // Grade, full combo and the modifier count are all properties of a run that
  // actually finished — a failed run has no rank to speak of.
  if (!run.cleared) return ids;

  const grade = gradeFor(run.accuracy);
  if (grade === 'S' || grade === 'SS') ids.push('game.slice_it.s_rank');
  if (grade === 'SS') ids.push('game.slice_it.ss_rank');

  if (run.isFullCombo) {
    ids.push('game.slice_it.full_combo');
    if (run.difficulty === 'expert') ids.push('game.slice_it.expert_fc');
  }

  if (countActiveModifiers(run.modifiers) >= STACKED_MODIFIER_THRESHOLD) {
    ids.push('game.slice_it.stacked');
  }

  return ids;
}
