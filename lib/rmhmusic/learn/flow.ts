import {
  readJson,
  writeJson,
} from '@/lib/core/persist';
import { BPM } from './machines/tap-beat';

/**
 * Adaptive tempo for the tap-the-beat lesson: flow and the zone of proximal
 * development.
 *
 * Csikszentmihalyi's flow channel: attention holds when the challenge sits just
 * above current skill. Too easy is boredom, too hard is anxiety. Vygotsky's zone
 * of proximal development says the same about learning: the useful exercise is
 * the one a learner can just about do.
 *
 * So the tempo follows the last score. A clean run (90+) speeds the next one up
 * by one step, a hard one (under 60) slows it down, anything between keeps the
 * tempo, and the learner always starts at {@link BPM}. The tempo is per device
 * (Web Storage), because it is a practice setting, not progress.
 */

/** Slowest tempo the lesson drops to. */
export const FLOW_MIN_BPM = 64;
/**
 * Fastest tempo. Bounded by the lesson's tail wait: `MAX_TAIL_MS` (600 ms, machines/tap-beat.ts) must
 * stay under one beat so the run stops before the next click could sound, and
 * one beat at 96 BPM is 625 ms.
 */
export const FLOW_MAX_BPM = 96;
/** One step up or down. */
export const FLOW_STEP_BPM = 8;
/** A score at or above this speeds the next run up. */
export const FLOW_UP_AT = 90;
/** A score below this slows the next run down. */
export const FLOW_DOWN_BELOW = 60;

const KEY =
  'rmh-music-tap-beat-bpm';

/** The tempo for the run after one that scored `score` (0-100) at `bpm`. */
export function nextTempo(
  bpm: number,
  score: number,
): number {
  let next =
    bpm;
  if (
    score >=
    FLOW_UP_AT
  )
    next =
      bpm +
      FLOW_STEP_BPM;
  else if (
    score <
    FLOW_DOWN_BELOW
  )
    next =
      bpm -
      FLOW_STEP_BPM;
  return Math.min(
    FLOW_MAX_BPM,
    Math.max(
      FLOW_MIN_BPM,
      next,
    ),
  );
}

function validTempo(
  value: unknown,
):
  | number
  | undefined {
  return typeof value ===
    'number' &&
    Number.isFinite(
      value,
    ) &&
    value >=
      FLOW_MIN_BPM &&
    value <=
      FLOW_MAX_BPM
    ? value
    : undefined;
}

/** The tempo the next tap-the-beat run plays at. */
export function readTempo(): number {
  return readJson(
    KEY,
    BPM,
    {
      validate:
        validTempo,
    },
  );
}

/** Record a finished run and return the tempo the next one will use. */
export function recordTempoRun(
  bpm: number,
  score: number,
): number {
  const next =
    nextTempo(
      bpm,
      score,
    );
  writeJson(
    KEY,
    next,
  );
  return next;
}
