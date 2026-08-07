/**
 * Slice It — server-side replay verification (`R8`).
 *
 * ## The hole this closes
 *
 * `verifySliceIt` in `lib/game/replay.ts` re-simulates a replay's *score* from
 * its own judgement log and rejects a log that contradicts itself. Its own
 * comment is honest about the ceiling: it has no access to the beat map, so it
 * cannot check that the claimed judgements match notes that actually existed. A
 * log of 2 000 fabricated `perfect`s on a chart with 300 notes passes it.
 *
 * `integrity.ts` documents the matching hole from the other side — its score
 * ceiling "assumes the entire song could have been one held note at the highest
 * combo reached", so a cheat that stays under a duration-scaled hold budget gets
 * past it. Both checks are bounds. This one is not: it rebuilds the exact chart
 * the run played and re-judges every input against real notes.
 *
 * ## Why it is `.server` and why it is asynchronous
 *
 * The chart lives in `Song.analysisData`, which is a database read of a payload
 * measured in hundreds of kilobytes, and the re-judge is O(inputs). Neither
 * belongs on the submission path: a score endpoint that got slower as a chart
 * got denser would punish the players on the hardest charts, and a verification
 * that can fail for an infrastructure reason must never be the thing that
 * decides whether a real run counted. It runs after the fact, on the few runs
 * that carry a replay at all.
 *
 * ## Every constant comes from `scoring.ts`
 *
 * Nothing here re-implements a hit window, a point value, or a multiplier —
 * `judge`, `pointsFor`, `accuracyWeight`, `accuracyOf`, `timingScale` and
 * `calculateScoreMultiplier` are imported from the module the game itself scores
 * with. A scoring change therefore cannot leave the verifier judging by rules
 * the game stopped using; it can only make it disagree, which is a test failure,
 * not a silently wrong verdict.
 */

import { prisma } from '@/lib/prisma.server';
import { getReplayable, type SliceItReplay } from '@/lib/game/replay';
import { HIT_WINDOWS } from './constants';
import { prepareChart } from './chart';
import { poolOf } from './pools';
import { modsFromReplay, REPLAY_TO_HIT_RESULT } from './replay';
import {
  accuracyOf,
  accuracyWeight,
  calculateScoreMultiplier,
  judge,
  pointsFor,
  timingScale,
} from './scoring';
import type { BeatMap, HitResult, Slice } from './types';

/** Why a replay could not be verified, or why it failed. */
export type VerifyFailure =
  /** The payload does not parse against the shared schema. */
  | 'invalid-replay'
  /** No song row, or it carries no generated chart to re-judge against. */
  | 'no-chart'
  /**
   * An input landed where the chart has no unresolved note — nothing within a
   * hit window of it, a note in the other lane, or a note a previous input in
   * this same log already claimed.
   */
  | 'input-matches-no-note'
  /** The re-judged score is not the score the run claimed. */
  | 'score-mismatch';

export interface VerifyOk {
  ok: true;
  /** The score the inputs actually produce against the real notes. */
  score: number;
  /** 0–1, re-derived the same way. */
  accuracy: number;
  maxCombo: number;
  notesResolved: number;
  /** Judgement histogram, re-derived — not the client's. */
  judgements: Record<string, number>;
}

export interface VerifyFailed {
  ok: false;
  reason: VerifyFailure;
  /** Present when the failure is a disagreement rather than a rejection. */
  score?: number;
}

export type VerifyResult = VerifyOk | VerifyFailed;

/**
 * The margin an input may miss its note by and still be matched to it.
 *
 * The widest window at the run's timing scale, and nothing meaningfully wider:
 * an input outside it is not a late hit on that note, it is an input for a note
 * that is not there. Matching generously would let a fabricated log borrow a
 * real note from half a second away and be judged `MISS` against it — which
 * costs nothing to claim and would pass.
 *
 * The 5 ms is float slack, not leniency: an input judged `BAD` sits at exactly
 * `HIT_WINDOWS.BAD * scale` from its note, and a comparison at the boundary
 * should not turn on the last bit of a double.
 */
function matchWindow(scale: number): number {
  return HIT_WINDOWS.BAD * scale + 0.005;
}

/**
 * The nearest unresolved note in `lane` within `window` of `at`.
 *
 * A linear scan from a moving cursor, not a search of the whole chart per input:
 * both the chart and the log are sorted by time, so the cursor only ever moves
 * forward and the whole verification is one pass over each.
 */
function nearestUnresolved(
  chart: Slice[],
  from: number,
  lane: number,
  at: number,
  window: number,
): number {
  let best = -1;
  let bestDistance = Infinity;
  for (let i = from; i < chart.length; i++) {
    const slice = chart[i];
    if (slice.time - at > window) break;
    if (slice.hit) continue;
    if (slice.type === 'SILENT' || slice.type === 'BOMB') continue;
    if (at - slice.time > window) continue;
    // A SWITCH note arrives in the opposite lane to the one it starts in, which
    // is the lane the player pressed and therefore the lane the log recorded.
    const arrivalLane = slice.type === 'SWITCH' ? (slice.lane === 0 ? 1 : 0) : slice.lane;
    if (arrivalLane !== lane) continue;
    const distance = Math.abs(slice.time - at);
    if (distance < bestDistance) {
      best = i;
      bestDistance = distance;
    }
  }
  return best;
}

/**
 * Re-judge a replay against a chart.
 *
 * Pure, so it is unit-testable without a database — {@link verifyStoredReplay}
 * is the thin wrapper that fetches the song and calls this.
 *
 * The check that matters is the last one: the score the inputs *produce* must be
 * the score the run *claimed*. Everything before it exists so that comparison is
 * meaningful — an input with no note under it, or two inputs on one note, would
 * otherwise let a log manufacture combo out of nothing and still add up.
 */
export function verifyAgainstChart(
  replay: SliceItReplay,
  chart: Slice[],
  claimedScore?: number,
): VerifyResult {
  const modifiers = modsFromReplay(replay.mods);
  const scale = timingScale(modifiers);
  const window = matchWindow(scale);
  const multiplier = calculateScoreMultiplier(modifiers);

  // A local copy of the resolution flags: the caller's chart must not come back
  // mutated, and `prepareChart` hands out fresh objects anyway.
  const notes = chart.map((slice) => ({ ...slice, hit: false }));

  let score = 0;
  let combo = 0;
  let maxCombo = 0;
  let notesResolved = 0;
  let hitPoints = 0;
  let cursor = 0;
  const judgements: Record<string, number> = {};

  for (const input of replay.inputs) {
    const at = input.t / 1000;
    const lane = input.lane ?? 0;

    // Advance the cursor past notes no input can reach any more. Everything
    // behind it is either resolved or was never hit, and a later input cannot
    // legally claim it — the log is time-ordered, which `verifySliceIt` has
    // already enforced before this runs.
    while (cursor < notes.length && at - notes[cursor].time > window) cursor++;

    // `nearestUnresolved` skips notes already claimed, so a second input on one
    // note finds nothing and fails as `input-matches-no-note` — which is what it
    // is: an input for a note that is (no longer) there.
    const index = nearestUnresolved(notes, cursor, lane, at, window);
    if (index < 0) return { ok: false, reason: 'input-matches-no-note' };
    notes[index].hit = true;

    // The judgement the *chart* implies, not the one the log claims. A log that
    // says `perfect` for an input 200 ms off its note is re-judged here and the
    // claim is rejected — the claim is data, not evidence.
    //
    // A claimed miss is the one input whose timestamp carries no timing at all:
    // nothing was pressed, so the recorder stamps it at the note's own time (see
    // `engine.ts#resolve`). Re-judging that reading would derive a flawless hit
    // from the absence of one. It is taken at face value instead, which is safe
    // in the only direction that matters: a miss scores nothing and breaks the
    // combo, so claiming one can never buy anything.
    const claimed: HitResult = REPLAY_TO_HIT_RESULT[input.judgment];
    let result: HitResult = 'MISS';
    if (claimed !== 'MISS') {
      result = judge(at - notes[index].time, scale);
      // The claimed judgement has to be in the same family as the derived one,
      // or the log is describing a different run: a fabricated `perfect` beside
      // a derived `MISS` is the exact substitution this check exists for.
      if (!agrees(result, claimed)) return { ok: false, reason: 'input-matches-no-note' };
    }

    notesResolved++;
    hitPoints += accuracyWeight(result);
    judgements[result] = (judgements[result] ?? 0) + 1;

    if (result === 'MISS' || result === 'BAD') {
      combo = 0;
    } else {
      combo++;
      if (combo > maxCombo) maxCombo = combo;
      score += pointsFor(result, combo, multiplier);
    }
  }

  const accuracy = accuracyOf(hitPoints, notesResolved);
  if (typeof claimedScore === 'number' && !withinTolerance(score, claimedScore)) {
    return { ok: false, reason: 'score-mismatch', score };
  }

  return { ok: true, score, accuracy, maxCombo, notesResolved, judgements };
}

/**
 * Does a derived judgement match a claimed one?
 *
 * Compared after mapping the derived result through the same four-value
 * narrowing the recorder used, because that is the only comparison the log can
 * support: it stores `perfect` for both `MARVELOUS` and `PERFECT`, so requiring
 * `MARVELOUS === PERFECT` would fail every honest replay.
 */
function agrees(derived: HitResult, claimed: HitResult): boolean {
  return narrow(derived) === narrow(claimed);
}

function narrow(result: HitResult): string {
  if (result === 'MARVELOUS' || result === 'PERFECT') return 'perfect';
  if (result === 'GOOD' || result === 'BAD') return 'good';
  return result.toLowerCase();
}

/**
 * How far a re-judged score may sit from the claimed one.
 *
 * Not zero, and the reason is holds. The log records resolutions; a LONG note's
 * *accrual* — `HOLD_TICK_POINTS_PER_SECOND` per second held, plus the release
 * bonus — happens between resolutions and is not in it. So the re-judged score
 * is a **floor**: an honest run scores at least this and possibly more. The
 * comparison is therefore one-sided, which is the direction that matters — a
 * score *below* what its own inputs produce is impossible, and a score above it
 * is only unexplained once it exceeds what holds could have paid.
 *
 * The upper slack is the plausibility ceiling's job (`maxPlausibleScore`), which
 * already bounds the hold term. Here it is a generous 3×: the point of this
 * check is catching a log that produces a *fraction* of its claimed score, which
 * is what a fabricated one does.
 */
function withinTolerance(derived: number, claimed: number): boolean {
  return claimed >= derived * 0.99 && claimed <= Math.max(derived * 3, 10_000);
}

/**
 * Rebuild the chart a replay was recorded against.
 *
 * The chart is *generated*: `prepareChart` places bombs and lane-switches with a
 * PRNG seeded on `(songId, difficulty, bombs, switching, oneTrack)`, all of
 * which the replay carries in `mods`. So the notes come back exactly as the run
 * played them — which is what makes re-judging possible at all, and why a replay
 * that lost its `mods` is unverifiable rather than merely awkward.
 */
export function chartForReplay(replay: SliceItReplay, analysisData: unknown): Slice[] | null {
  const map = analysisData as BeatMap | null;
  if (!map || typeof map !== 'object' || !map.slices) return null;
  const modifiers = modsFromReplay(replay.mods);
  const chart = prepareChart({ ...map, id: replay.track }, modifiers);
  return chart.length > 0 ? chart.sort((a, b) => a.time - b.time) : null;
}

/**
 * Verify one stored replay: fetch its song, rebuild its chart, re-judge it.
 *
 * Returns a result rather than throwing on a failed verification — a replay that
 * does not check out is an *answer*, and the caller (a background pass) decides
 * what to do with it. Only a missing row or an unparsable payload is a
 * non-answer.
 */
export async function verifyStoredReplay(replayId: string): Promise<VerifyResult> {
  const row = await prisma.gameReplay.findUnique({
    where: { id: replayId },
    select: { data: true, game: true, userId: true },
  });
  if (!row || row.game !== 'slice-it') return { ok: false, reason: 'invalid-replay' };

  const def = getReplayable('slice-it');
  const parsed = def?.schema.safeParse(row.data);
  if (!parsed?.success) return { ok: false, reason: 'invalid-replay' };
  const replay = parsed.data as SliceItReplay;

  const song = await prisma.song.findUnique({
    where: { id: replay.track },
    select: { analysisData: true },
  });
  const chart = song ? chartForReplay(replay, song.analysisData) : null;
  if (!chart) return { ok: false, reason: 'no-chart' };

  // The score being checked is the one *this* run's owner has standing on *this*
  // board — the four coordinates the score route files a personal best under.
  // The board's top score would be somebody else's run and checking against it
  // would be meaningless.
  const modifiers = modsFromReplay(replay.mods);
  const best = await prisma.songLeaderboard.findUnique({
    where: {
      songId_difficulty_modPool_userId: {
        songId: replay.track,
        difficulty: modifiers.difficulty,
        modPool: poolOf(modifiers),
        userId: row.userId,
      },
    },
    select: { score: true },
  });

  return verifyAgainstChart(replay, chart, best?.score);
}

/**
 * Run the verification off the request path and record what it found.
 *
 * Detached on purpose, and detached *shallowly*: the promise is not awaited, so
 * nothing about the response depends on it, and every failure is swallowed into
 * a log line. A verification that threw and took a submission's 200 with it
 * would be a worse outcome than never verifying at all.
 *
 * The production home for this is a pg-boss job or the Go supervisor (`R8` says
 * so), which survives a deploy mid-verification and can retry. This is the
 * in-process version: correct, immediate, and honest about being best-effort.
 * See `docs/_handoff/replay-requests.md`.
 */
export function scheduleVerification(replayId: string): void {
  setTimeout(() => {
    verifyStoredReplay(replayId)
      .then((result) => {
        if (result.ok) return;
        console.warn('[slice-it] replay failed verification', {
          replayId,
          reason: result.reason,
          derivedScore: result.score,
        });
      })
      .catch((error: unknown) => {
        console.warn('[slice-it] replay verification errored', {
          replayId,
          error: error instanceof Error ? error.message : String(error),
        });
      });
  }, 0);
}
