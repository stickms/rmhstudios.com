/**
 * Starter categories (design K1).
 *
 * Categories are DB rows — `SpeedrunCategory` — because a community invents its
 * own ("no-shards", "hardcore", "glitchless") and a hardcoded list would freeze
 * that. This is only the seed: the set an admin can open with one click so the
 * first board on a game is not a blank page, and the worked example of what a
 * `rules` string should read like.
 *
 * Deliberately short. A category nobody runs is worse than no category, and
 * these are the two the existing replay capture contract can actually support
 * today (`lib/game/replay.ts` records Lights Out and Slice It!).
 *
 * Client-safe: the admin UI renders the same list the API seeds from.
 */

import { LIGHTS_OUT_VERSION, SLICE_IT_VERSION } from '@/lib/game/replay';
import type { SpeedrunMetric } from './types';

export interface SpeedrunCategorySeed {
  game: string;
  slug: string;
  name: string;
  rules: string;
  metric: SpeedrunMetric;
  /**
   * The game logic version this board is for. Taken from the capture contract
   * rather than typed out, so a game whose logic version is bumped does not
   * silently keep seeding boards for the version before it.
   */
  version: string;
}

export const DEFAULT_SPEEDRUN_CATEGORIES: readonly SpeedrunCategorySeed[] = [
  {
    game: 'lights-out',
    slug: 'any',
    name: 'Any%',
    rules:
      'Clear the board by any route. Timing starts on the first cell you toggle and ' +
      'stops the moment the board is dark. The replay is re-simulated from its seed: ' +
      'a run that does not end on a solved board is rejected automatically.',
    metric: 'time',
    version: LIGHTS_OUT_VERSION,
  },
  {
    game: 'slice-it',
    slug: 'high-score',
    name: 'High score',
    rules:
      'One full track, highest score. The score is recomputed from the judgment log ' +
      'rather than taken from the client, and a log whose timestamps are out of order ' +
      'is rejected — but the judgments themselves cannot be checked against the track, ' +
      'so runs are reviewed before they are ranked.',
    metric: 'score',
    version: SLICE_IT_VERSION,
  },
] as const;
