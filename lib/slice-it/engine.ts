/**
 * Slice It — the gameplay engine.
 *
 * Owns the chart, the clock and the judgement of a single run. Everything it
 * decides is local: in multiplayer the server is the authority on the lobby and
 * the match lifecycle, but never on whether a note was hit, because what is
 * being judged is the alignment between the player's input and audio playing on
 * their own machine.
 *
 * ## What changed from the original
 *
 * - **Chart preparation moved out**, to `chart.ts`. It used to happen inside
 *   `loadMap` with bare `Math.random()`, which meant bombs and lane-switches
 *   landed somewhere different on every retry — and, in multiplayer, somewhere
 *   different for every player in the lobby, who then compared scores. It is
 *   now seeded on `(songId, difficulty, modifiers)`.
 * - **Scoring constants moved out**, to `constants.ts`/`scoring.ts`, so the
 *   score endpoint can bound a submission using the same numbers that produced
 *   it.
 * - **Multiplayer reporting is throttled deliberately**, not by
 *   `Math.random() < 0.05`. That idiom fired on ~5% of frames, which is ~3/s at
 *   60fps and ~7/s on a 144Hz display — the players with the best hardware
 *   generated the most traffic, and every emit was a separate broadcast to the
 *   whole room.
 * - **`update()` no longer scans the whole chart every frame.** It walked all
 *   N notes per frame looking for missed ones; on a 5000-note Expert chart at
 *   144Hz that is 720,000 checks a second to find the handful that expired.
 *   Notes are sorted, so a cursor advances through them once.
 */

import { AudioManager } from '../audio/AudioManager';
import { asset } from '@/lib/storage/asset';
import {
  BOMB_PENALTY,
  COMBO_BREAK_FULL_INTENSITY,
  COMBO_BREAK_THRESHOLD,
  HEALTH_BOMB_DRAIN,
  HEALTH_DELTA,
  HEALTH_MAX,
  HIT_WINDOWS,
  HOLD_TICK_MAX_STEP_SEC,
  HOLD_TICK_POINTS_PER_SECOND,
  INPUT_COOLDOWN_MS,
  JUDGEMENT_COLORS,
  JUDGEMENT_ORDER,
  RELEASE_WINDOW_SCALE,
} from './constants';
import type { BeatMap, HitResult, RunStats, Slice } from './types';
import { MIN_TIMING_SAMPLES, type TimingSummary } from './integrity';
import { prepareChart, scorableNoteCount } from './chart';
import {
  buildReplayInputs,
  JUDGMENT_CODE,
  NOT_RECORDED,
  REPLAY_MAX_INPUTS,
  REPLAY_TO_HIT_RESULT,
  replayMods,
  replaySeed,
  type ReplayInput,
} from './replay';
import type { SliceItReplay } from '@/lib/game/replay';
import { useSliceItStore } from './store';
import {
  accuracyOf,
  accuracyWeight,
  calculateScoreMultiplier,
  judge,
  pointsFor,
  timingScale,
} from './scoring';
import { reportFinish, reportScore } from './net/client';
import { hapticsEnabled, hapticsIntensity, vibrate } from '@/lib/shared/platform';

/** Colours the feedback text is drawn in, per judgement. */
const FEEDBACK_COLORS: Record<HitResult, string> = JUDGEMENT_COLORS;

/**
 * V5 — combo milestones. Exported so `GameCanvas.tsx` can look up how far a
 * given crossing sits up the list (for the escalating treatment) without a
 * second copy of these numbers living in the renderer.
 */
export const COMBO_MILESTONES = [50, 100, 250, 500, 1000] as const;

/**
 * A8 — haptic duration per judgement, ms, before the intensity setting scales
 * it down.
 *
 * Short and DISTINCT rather than proportional to how good the hit was: the
 * hand cannot resolve 8 ms from 11 ms, so a linear scale over six judgements
 * would be felt as one buzz. MISS is longest because it is the one result a
 * player needs to notice without looking at the screen.
 */
const HAPTIC_MS: Record<Exclude<HitResult, 'NONE'>, number> = {
  MARVELOUS: 6,
  PERFECT: 6,
  GREAT: 10,
  GOOD: 14,
  BAD: 18,
  MISS: 28,
};

/**
 * How many recent hit offsets the error bar can draw.
 *
 * A fixed ring rather than a growing array: this is written on the input path
 * and read every frame, and a rhythm game is the last place to allocate on
 * either. 64 at even a dense 8 notes/second is the last eight seconds, which is
 * more history than the bar is legible with.
 */
const OFFSET_RING_SIZE = 64;

/** A blank judgement histogram. */
function emptyJudgements(): Record<Exclude<HitResult, 'NONE'>, number> {
  const out = {} as Record<Exclude<HitResult, 'NONE'>, number>;
  for (const judgement of JUDGEMENT_ORDER) out[judgement] = 0;
  return out;
}

/**
 * How often a live score is published to the lobby, ms.
 *
 * Halved from 400: the opponent board is the only thing in a match that tells
 * you whether you are winning, and at 400 ms of client staleness plus a 500 ms
 * server tick it could be nearly a second behind. See `SCORE_TICK_MS`.
 */
const SCORE_REPORT_INTERVAL_MS = 200;

/**
 * Largest input-dispatch delay the judge will credit back, seconds.
 *
 * 100 ms is far more than a real event queue costs and less than any hit window
 * at any speed, so a clamped value can never turn a miss into a hit.
 */
const MAX_INPUT_DISPATCH_SEC = 0.1;

export interface Feedback {
  id: number;
  text: string;
  lane: number;
  time: number;
  color: string;
  /** Signed timing error in seconds, for the early/late meter. */
  offset?: number;
}

export class GameEngine {
  private audioManager: AudioManager;
  private beatMap: BeatMap | null = null;
  /** The prepared chart, sorted by time. */
  private slices: Slice[] = [];
  private processedSliceIds = new Set<string>();
  /** lane → the LONG note currently being held. */
  private activeHolds = new Map<number, Slice>();
  /** lane → audio time that lane's hold has already been paid for. */
  private holdBilledTo = new Map<number, number>();
  /** Sub-point remainder carried between hold accruals, so it is not lost. */
  private holdCredit = 0;
  private lastInputTime = new Map<number, number>();

  /**
   * Index of the earliest note that has not yet been resolved *or* expired.
   * Everything before it is done with; the miss sweep starts here.
   */
  private cursor = 0;

  public feedbackQueue: Feedback[] = [];
  private feedbackIdCounter = 0;

  private score = 0;
  private combo = 0;
  private maxCombo = 0;
  private speedMultiplier = 1;
  private notesResolved = 0;
  private hitPoints = 0;
  private songId = '';
  /** Notes in the prepared chart that count toward accuracy. */
  private totalNotes = 0;
  /** Judgement histogram, for the HUD and the results screen. */
  private judgements = emptyJudgements();

  private inMultiplayer = false;
  private lastReportAt = 0;
  private finished = false;

  /* ── The health gauge (opt-in; see `Modifiers.healthGauge`) ────────────── */

  /** 0–{@link HEALTH_MAX}. Stays pinned at full while the gauge is off. */
  private health = HEALTH_MAX;
  /**
   * What draining to zero costs.
   *
   * `'fail'` solo, `'survive'` in a match — set by {@link setMultiplayer}, and
   * the reason the modifier does not need a multiplayer clamp of its own. See
   * the note on `forMultiplayer` in `modifiers.ts`.
   */
  private failMode: 'fail' | 'survive' = 'fail';
  /** Sticky: once the gauge has touched zero, its score bonus is gone. */
  private gaugeBroken = false;
  /** True when a fail-condition modifier ended this run. Solo only. */
  private failed = false;
  /** Which one. `null` until {@link failed} is true — see {@link fail}. */
  private failReason: 'health' | 'perfectionist' | null = null;

  /** Running mean/variance of hit timing error (Welford). See `recordOffset`. */
  private offsetCount = 0;
  private offsetMean = 0;
  private offsetM2 = 0;

  /**
   * The last {@link OFFSET_RING_SIZE} signed hit offsets and when each landed,
   * for the early/late bar. Kept beside the Welford accumulator rather than
   * derived from it — a mean and a variance cannot be drawn as a tick cloud.
   *
   * One stable object, returned by reference from {@link getRecentOffsets}, so
   * reading it every frame allocates nothing.
   */
  private readonly offsetRing = {
    /** Signed seconds; negative is early. `0` marks an unused slot. */
    offsets: new Float32Array(OFFSET_RING_SIZE),
    /** `performance.now()` at the hit, for the fade. */
    times: new Float32Array(OFFSET_RING_SIZE),
  };
  private offsetHead = 0;

  /**
   * The last combo break worth reacting to, or null.
   *
   * `magnitude` is 0–1, so the renderer's reaction scales with what was actually
   * lost rather than firing identically for a 25-chain and a 400-chain.
   */
  private comboBreak: { at: number; magnitude: number } | null = null;

  /**
   * V5 — the highest combo milestone already celebrated this run, so a
   * crossing fires once. Not reset on a combo break: rebuilding to a number
   * already celebrated does not re-trigger it, the same way a game does not
   * re-show an achievement toast for a thing you already unlocked.
   */
  private lastMilestone = 0;
  /** The most recent milestone worth drawing, or null. Read once per frame. */
  private comboMilestone: { value: number; at: number } | null = null;

  /* ── Replay capture (R3) ───────────────────────────────────────────────── *
   *
   * Three pre-sized typed arrays, not an array of objects. Recording happens
   * inside `resolve`, which is on the input path and — for the miss sweep — on
   * the frame path, and this is a rhythm game: a `push({t, lane, judgment})` per
   * note is an object literal, a string, and an amortised array grow in the one
   * place where a GC pause costs the player the next note. Parallel arrays of
   * numbers write into memory that was allocated once, before the song started.
   * The objects the schema wants are materialised once, at submission, by
   * {@link getReplayLog}.
   *
   * Bounded at the schema's own {@link REPLAY_MAX_INPUTS}: a chart dense enough
   * to overflow it is past `MAX_NOTES_PER_SECOND` anyway, and truncating is
   * better than sending a payload that will be rejected whole.
   * ----------------------------------------------------------------------- */
  private readonly replayTimes = new Int32Array(REPLAY_MAX_INPUTS);
  private readonly replayLanes = new Uint8Array(REPLAY_MAX_INPUTS);
  private readonly replayJudgments = new Uint8Array(REPLAY_MAX_INPUTS);
  private replayCount = 0;
  /** True once a run has produced more resolutions than the log can hold. */
  private replayTruncated = false;

  /* ── Replay playback (R4) ──────────────────────────────────────────────── */

  /** Non-null while this engine is *playing back* a log rather than a player. */
  private replayInput: ReplayInput[] | null = null;
  private replayCursor = 0;
  /**
   * Playback position in seconds, driven by the viewer.
   *
   * Playback does not read the audio clock. `AudioManager` can start and stop
   * but cannot seek (there is no public way to set its `pauseTime`), so a
   * viewer that scrubbed would have a chart at one position and audio at
   * another — which is worse than silence. The viewer owns the timeline
   * instead and the engine follows it; see `docs/_handoff/replay-requests.md`
   * for the one-method change to `AudioManager` that would let audio follow too.
   */
  private replayTime = 0;

  constructor() {
    this.audioManager = AudioManager.getInstance();
  }

  getActiveMap(): BeatMap | null {
    return this.beatMap;
  }

  getSlices(): Slice[] {
    return this.slices;
  }

  getProcessedSliceIds(): Set<string> {
    return this.processedSliceIds;
  }

  /**
   * True while this run is part of a multiplayer match.
   *
   * Also decides what the health gauge means. In a race the gauge never ends a
   * run: the cost of dying is not losing, it is sitting out the remaining three
   * minutes of a song everyone else is still playing — the same reasoning that
   * drops Sudden Death from a lobby. Draining to zero there forfeits the
   * modifier's bonus and the run plays on.
   */
  setMultiplayer(value: boolean): void {
    this.inMultiplayer = value;
    this.failMode = value ? 'survive' : 'fail';
  }

  async loadMap(map: BeatMap, preloadedBuffer?: AudioBuffer): Promise<void> {
    const store = useSliceItStore.getState();
    const modifiers = store.modifiers;

    this.beatMap = map;
    this.songId = map.id;
    // Deterministic: same song + same settings ⇒ same notes, on a retry and on
    // every machine in a lobby.
    this.slices = prepareChart(map, modifiers).sort((a, b) => a.time - b.time);
    // Bombs and silent notes never enter the accuracy denominator, so neither do
    // they count toward "misses left for grade X" — see `missesAllowedFor`.
    //
    // G5 — a LONG note's release is now judged (and counted) separately from
    // its head, so a chart's maximum reachable `notesResolved` is one *more*
    // than its note count for every LONG note in it. Sized here, once, rather
    // than recomputed on every frame `missesAllowedFor` reads it.
    const releasableHolds = this.slices.filter((s) => s.type === 'LONG' && !!s.duration).length;
    this.totalNotes = scorableNoteCount(this.slices) + releasableHolds;

    this.reset();
    store.setSongId(map.id);

    if (preloadedBuffer) {
      this.audioManager.loadFromBuffer(preloadedBuffer);
    } else {
      await this.audioManager.loadTrack(map.audioUrl);
    }
    this.audioManager.setPlaybackRate(this.speedMultiplier);

    // Warm the hit sound so the first note is not the one that stutters.
    const hitSound = store.hitSound;
    if (hitSound && hitSound !== 'default') {
      this.audioManager
        .preloadHitSound(asset(`/music/slice-it/sounds/${hitSound}`))
        .catch(() => {});
    }
  }

  /**
   * Clear the run.
   *
   * `startingHealth` exists for S2 courses, where the gauge is the mode: a
   * course is 3-5 charts on ONE shared gauge, and that carry-over is the only
   * thing separating it from a playlist. Without it `reset()` handed every song
   * a full bar and `course.ts` could track a number that never reached the
   * player — it computed the carried health, failed the course on it, and then
   * song N+1 started at 100 anyway.
   *
   * Omitted, it is a full bar, which is every other caller.
   */
  reset(startingHealth?: number): void {
    this.processedSliceIds.clear();
    this.activeHolds.clear();
    this.holdBilledTo.clear();
    this.holdCredit = 0;
    this.lastInputTime.clear();
    this.feedbackQueue.length = 0;
    this.cursor = 0;
    this.score = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.notesResolved = 0;
    this.hitPoints = 0;
    this.finished = false;
    this.lastReportAt = 0;
    this.judgements = emptyJudgements();
    // Clamped rather than trusted: a course reducer that produced a negative or
    // out-of-range number must not be able to start a run already dead, or
    // already immortal.
    this.health =
      typeof startingHealth === 'number' && Number.isFinite(startingHealth)
        ? Math.max(0, Math.min(HEALTH_MAX, startingHealth))
        : HEALTH_MAX;
    this.gaugeBroken = false;
    this.failed = false;
    this.failReason = null;
    this.offsetCount = 0;
    this.offsetMean = 0;
    this.offsetM2 = 0;
    this.offsetRing.offsets.fill(0);
    this.offsetRing.times.fill(0);
    this.offsetHead = 0;
    this.comboBreak = null;
    this.lastMilestone = 0;
    this.comboMilestone = null;
    // The log is emptied by moving one integer: the arrays keep their memory for
    // the next run, which is the whole reason they are pre-sized.
    this.replayCount = 0;
    this.replayTruncated = false;
    this.replayCursor = 0;

    for (const slice of this.slices) {
      slice.hit = false;
      slice.hitTime = undefined;
    }

    const store = useSliceItStore.getState();
    this.speedMultiplier = store.modifiers.speed || 1;
    store.setScore(0, 0, this.speedMultiplier);
    store.setMaxCombo(0);
    store.setAccuracy(0);
    store.setIsPaused(false);

    this.audioManager.stop();
    this.audioManager.setPlaybackRate(this.speedMultiplier);
  }

  start(): void {
    this.audioManager.setPlaybackRate(this.speedMultiplier);
    this.audioManager.play();
  }

  pause(): void {
    this.audioManager.pause();
    useSliceItStore.getState().setIsPaused(true);
  }

  resume(): void {
    if (useSliceItStore.getState().status === 'PLAYING') {
      this.audioManager.play();
      useSliceItStore.getState().setIsPaused(false);
    }
  }

  /**
   * H6 — jump straight to a point in the song, e.g. 2s before the first
   * hittable note when a chart's lead-in runs long.
   *
   * Only ever called into the *silent* stretch before the first note today,
   * so the walk below never has anything to do — but it is here rather than
   * a bare `audioManager.seek()` so a future caller landing mid-chart (a
   * scrub bar, P1's practice mode) does not get free notes: anything between
   * the old cursor and the new position is marked processed-without-judging
   * instead of being left for the miss sweep to flag the instant playback
   * resumes past it.
   */
  seek(seconds: number): void {
    const target = Math.max(0, seconds);
    this.audioManager.seek(target);
    for (let i = this.cursor; i < this.slices.length; i++) {
      const slice = this.slices[i];
      if (slice.time >= target - this.missWindow) break;
      this.processedSliceIds.add(slice.id);
      this.cursor = i + 1;
    }
  }

  /**
   * Current playback position, adjusted by the player's calibration offset.
   *
   * During playback the position is the viewer's, and the calibration offset is
   * deliberately not applied: it describes the *watcher's* audio hardware, and
   * subtracting it would re-time somebody else's run to this machine's latency —
   * the logged judgements would then land against notes they were not made
   * against.
   */
  private now(): number {
    if (this.replayInput !== null) return this.replayTime;
    const offsetSeconds = (useSliceItStore.getState().audioOffset || 0) / 1000;
    return this.audioManager.getCurrentTime() - offsetSeconds;
  }

  /**
   * The score multiplier this run is currently earning.
   *
   * Read per payout rather than cached because it can change mid-run: a broken
   * health gauge drops its bonus from here on, and everything banked before that
   * keeps the rate it was scored at.
   */
  private runMultiplier(): number {
    return calculateScoreMultiplier(useSliceItStore.getState().modifiers, {
      gaugeBroken: this.gaugeBroken,
    });
  }

  /**
   * The full miss window in seconds, at the current speed and timing factor.
   *
   * Routed through the shared `timingScale()` (A9) rather than a local
   * `strictFactor` getter that only knew about Strict Timing — this is also
   * `getTimingScale()`'s own formula, so "how far off can a press be and still
   * target something" and "how far off can a press be and still judge as
   * something" never drift apart just because one of them forgot Lenient
   * Timing exists.
   */
  private get missWindow(): number {
    return HIT_WINDOWS.BAD * timingScale(useSliceItStore.getState().modifiers);
  }

  /**
   * G5 — the window scale a hold's RELEASE is judged at: wider than a tap's
   * by {@link RELEASE_WINDOW_SCALE}, on top of whatever the run's own timing
   * factor and speed already do to it.
   */
  private releaseTimingScale(): number {
    return timingScale(useSliceItStore.getState().modifiers) * RELEASE_WINDOW_SCALE;
  }

  /**
   * A SWITCH note's lane at a given moment.
   *
   * The switch happens a fixed *musical* interval before the note, so a chart at
   * 2x gives you half the real-time warning — which is the point of playing it
   * at 2x.
   */
  getEffectiveLane(slice: Slice, currentTime: number): number {
    if (slice.type !== 'SWITCH') return slice.lane;
    const leadTime = 0.8 / this.speedMultiplier;
    return currentTime >= slice.time - leadTime ? (slice.lane === 0 ? 1 : 0) : slice.lane;
  }

  update(): void {
    const store = useSliceItStore.getState();
    if (store.status !== 'PLAYING' || store.isPaused) return;

    const currentTime = this.now();
    const duration = this.audioManager.getDuration();

    if (!this.finished && duration > 0 && currentTime >= duration) {
      this.finished = true;
      store.setStatus('FINISHED');
      this.audioManager.stop();
      if (this.inMultiplayer) this.publish(true);
      return;
    }

    if (this.slices.length === 0) return;

    // Before the hold accrual and before the miss sweep: a logged input has to
    // resolve its note while the note still exists, or the sweep expires it and
    // the replay shows a miss the run never had.
    if (this.replayInput !== null) this.stepReplay(currentTime);

    const scoreMultiplier = this.runMultiplier();
    const missWindow = this.missWindow;

    // Holds accrue while held and expire if held too far past their end.
    //
    // Accrual is per second of AUDIO, not per frame. It used to be a flat
    // `+= HOLD_TICK_POINTS` per `update()`, which made a hold worth 2.4x as much
    // on a 144 Hz display as on a 60 Hz one, worth less on a device that
    // stuttered, and — because `update()` was being called twice per frame —
    // twice what it was meant to be on all of them. Audio time is the only clock
    // in here that is the same for everybody.
    if (this.activeHolds.size > 0) {
      for (const [lane, slice] of this.activeHolds) {
        const holdEnd = slice.time + (slice.duration ?? 0);
        // G5 — the timeout boundary is the RELEASE window, not the tap one: a
        // hold nobody let go of is judged exactly like a release that landed
        // outside `releaseTimingScale()`'s BAD window, because that is what it
        // is. Using the narrower tap `missWindow` here would fire this sweep
        // before `submitRelease` (had the player actually released late) would
        // itself have called it a MISS.
        if (currentTime > holdEnd + HIT_WINDOWS.BAD * this.releaseTimingScale()) {
          this.activeHolds.delete(lane);
          this.holdBilledTo.delete(lane);
          // A release nobody made is now a judged event like any other — the
          // whole point of G5 is that an unjudged tail no longer exists.
          this.notesResolved++;
          this.hitPoints += accuracyWeight('MISS');
          this.judgements.MISS += 1;
          this.breakCombo();
          this.pushFeedback('MISS', lane, FEEDBACK_COLORS.MISS);
          this.applyHealth('MISS');
          this.checkFailConditions('MISS');
          this.commit();
        } else if (currentTime < holdEnd) {
          const billedTo = this.holdBilledTo.get(lane) ?? currentTime;
          // Clamped: a stall must not pay out the time the player was absent.
          const dt = Math.min(Math.max(0, currentTime - billedTo), HOLD_TICK_MAX_STEP_SEC);
          this.holdBilledTo.set(lane, currentTime);
          this.holdCredit +=
            HOLD_TICK_POINTS_PER_SECOND * dt * (this.combo > 0 ? this.combo : 1) * scoreMultiplier;
          // Whole points only, with the fraction carried — otherwise a 60 Hz
          // update at combo 1 floors to zero every time and holds score nothing.
          const whole = Math.floor(this.holdCredit);
          if (whole > 0) {
            this.score += whole;
            this.holdCredit -= whole;
          }
        }
      }
    }

    // Sweep expired notes. The cursor only ever moves forward, so this is one
    // pass over the chart across the whole song rather than one per frame.
    while (this.cursor < this.slices.length) {
      const slice = this.slices[this.cursor];
      if (slice.time + missWindow >= currentTime) break;
      if (!this.processedSliceIds.has(slice.id)) {
        if (slice.type === 'BOMB') {
          // A bomb you left alone is a bomb you dodged.
          this.processedSliceIds.add(slice.id);
        } else {
          this.resolve(slice, 'MISS', slice.lane);
        }
      }
      this.cursor++;
    }

    if (this.inMultiplayer) this.publish(false);
  }

  /**
   * Resolve a press.
   *
   * `pressTime` is the event's own `timeStamp` — a `performance.now()`-domain
   * reading of when the input actually happened, taken by the browser before the
   * event was queued. Judging against `this.now()` alone judges when JavaScript
   * got *around* to the press, which on a busy frame is 5–15 ms later; 15 ms is
   * the width of the MARVELOUS window, so that latency was being charged to the
   * player as if they had hit late. Reconstructing the audio position at the
   * moment of the press removes the main thread from the judgement.
   */
  submitInput(lane: number, pressTime?: number): void {
    const store = useSliceItStore.getState();
    if (store.isPaused) return;

    // One press must never resolve two notes.
    const now = performance.now();
    if (now - (this.lastInputTime.get(lane) ?? 0) < INPUT_COOLDOWN_MS) return;
    this.lastInputTime.set(lane, now);

    if (!this.beatMap) return;

    const currentTime = this.now() - this.dispatchDelaySeconds(pressTime, now);
    const targeted = this.getTargetedSlice(lane);

    if (!targeted || Math.abs(targeted.time - currentTime) > this.missWindow) {
      // Ghost tap. Breaks the combo but does not count against accuracy — you
      // did not miss a note, you hit nothing.
      this.breakCombo();
      this.pushFeedback('MISS', lane, FEEDBACK_COLORS.MISS);
      this.commit();
      return;
    }

    if (targeted.type === 'BOMB') {
      this.processedSliceIds.add(targeted.id);
      this.breakCombo();
      this.score = Math.max(0, this.score - BOMB_PENALTY);
      this.pushFeedback('BOMB!', lane, '#ff0000');
      this.audioManager.playSfX(150, 'sawtooth', 0.3, store.sfxVolume / 100);
      this.drainHealth(HEALTH_BOMB_DRAIN);
      this.commit();
      return;
    }

    // The offset the judgement was made from, not one re-read from the clock a
    // few statements later. It carries the dispatch-latency correction above,
    // which is the whole reason the judgement is fair — a timing summary that
    // did not carry it would tell the player to calibrate away the browser's
    // event queue, and `integrity.ts` would see a mean skewed late on every run.
    const offset = currentTime - targeted.time;
    const result = judge(offset, timingScale(store.modifiers));
    this.resolve(targeted, result, this.getEffectiveLane(targeted, currentTime), offset);
  }

  /**
   * G5 — judge a hold's RELEASE the same way a tap is judged: through the
   * shared `judge()`, at a wider window (`releaseTimingScale`), folded into
   * the same accuracy denominator and judgement histogram.
   *
   * Before this, releasing anywhere inside a flat window paid a fixed bonus
   * and releasing outside it paid partial credit for how much of the hold was
   * completed — binary either way, and invisible to accuracy: a hold's tail
   * was never judged at all, so an LN chart's accuracy read the same whether
   * every release was dead-center or barely inside the window. Now it is one
   * more judgement like any other, which is the actual point: there is
   * something to improve at.
   */
  submitRelease(lane: number): void {
    const held = this.activeHolds.get(lane);
    if (!held) return;
    this.activeHolds.delete(lane);
    this.holdBilledTo.delete(lane);

    const currentTime = this.now();
    const holdEnd = held.time + (held.duration ?? 0);
    const scoreMultiplier = this.runMultiplier();

    const offset = currentTime - holdEnd;
    const result = judge(offset, this.releaseTimingScale());

    this.notesResolved++;
    this.hitPoints += accuracyWeight(result);
    this.judgements[result] += 1;
    // `pointsFor` already returns 0 for MISS/BAD, so this is safe unconditional
    // — combo is read, not advanced: the LONG note's head already spent its one
    // combo increment, and the release only decides whether that chain survives.
    this.score += pointsFor(result, this.combo, scoreMultiplier);

    if (result === 'MISS' || result === 'BAD') {
      this.breakCombo();
    }
    this.pushFeedback(result, lane, FEEDBACK_COLORS[result], offset);
    this.checkFailConditions(result);
    this.feedbackHaptic(result);
    this.commit();
  }

  /**
   * The next note a press in this lane would resolve.
   *
   * Also what the renderer glows: showing the player which note is "armed" is
   * the difference between a two-lane game feeling readable and feeling random.
   */
  getTargetedSlice(lane: number): Slice | null {
    if (this.slices.length === 0) return null;
    const currentTime = this.now();
    const missWindow = this.missWindow;

    for (let i = this.cursor; i < this.slices.length; i++) {
      const slice = this.slices[i];
      // Notes further out than the window cannot be hit yet, and the chart is
      // sorted, so nothing after this one can be either.
      if (slice.time - currentTime > missWindow) break;
      if (this.processedSliceIds.has(slice.id)) continue;
      if (slice.type === 'SILENT') continue;
      if (currentTime > slice.time + missWindow) continue;
      if (slice.type === 'BOMB' && currentTime > slice.time) continue;

      // A SWITCH note is always targeted in the lane it will *arrive* in, so
      // the glow tells the player where to press rather than where it started.
      const sliceLane =
        slice.type === 'SWITCH'
          ? slice.lane === 0
            ? 1
            : 0
          : this.getEffectiveLane(slice, currentTime);
      if (sliceLane === lane) return slice;
    }
    return null;
  }

  getState() {
    return {
      notesResolved: this.notesResolved,
      /** Notes in the chart that count toward accuracy — the HUD's denominator. */
      totalNotes: this.totalNotes,
      /** Accuracy weight banked so far, out of `notesResolved * 100`. */
      hitPoints: this.hitPoints,
      score: this.score,
      combo: this.combo,
      maxCombo: this.maxCombo,
      accuracy: accuracyOf(this.hitPoints, this.notesResolved),
      multiplier: this.speedMultiplier,
      // The viewer's clock during playback; the audio clock otherwise. A
      // renderer asking "where are we" must get the position the notes are being
      // judged against, and in a replay that is not the audio element's.
      currentTime: this.replayInput !== null ? this.replayTime : this.audioManager.getCurrentTime(),
      health: this.health,
      gaugeBroken: this.gaugeBroken,
      failed: this.failed,
      isFullCombo: this.isFullCombo,
      isPerfect: this.isPerfect,
    };
  }

  /* ─── Internals ───────────────────────────────────────────────────────── */

  /**
   * How long ago the press really happened, in seconds.
   *
   * Bounded on both sides on purpose. Below zero is nonsense (a clock that
   * disagrees with itself), and above {@link MAX_INPUT_DISPATCH_SEC} is either a
   * genuinely enormous stall — where crediting the full gap would let a press
   * resolve a note that had already scrolled past — or a synthetic event with a
   * `timeStamp` chosen to make a late press look early. Both get clamped, so the
   * correction can only ever recover real dispatch latency.
   */
  private dispatchDelaySeconds(pressTime: number | undefined, now: number): number {
    if (pressTime === undefined || !Number.isFinite(pressTime)) return 0;
    const delayMs = now - pressTime;
    if (!(delayMs > 0)) return 0;
    return Math.min(delayMs, MAX_INPUT_DISPATCH_SEC * 1000) / 1000;
  }

  /**
   * @param offsetSeconds The signed error the judgement was made from. Omitted
   *   by the miss sweep, which has no press to measure and falls back to the
   *   clock.
   */
  private resolve(slice: Slice, result: HitResult, lane: number, offsetSeconds?: number): void {
    this.processedSliceIds.add(slice.id);
    slice.hit = result !== 'MISS';
    slice.hitTime = performance.now();

    const store = useSliceItStore.getState();
    const scoreMultiplier = this.runMultiplier();

    this.notesResolved++;
    this.hitPoints += accuracyWeight(result);
    if (result !== 'NONE') this.judgements[result] += 1;

    if (result === 'MISS' || result === 'BAD') {
      this.breakCombo();
    } else {
      this.combo++;
      this.maxCombo = Math.max(this.maxCombo, this.combo);

      // V5 — fires once per crossing, not every frame the combo sits on the
      // number: this runs once per resolved note, and a note only ever pushes
      // `combo` through a given value once (it always changes on the very
      // next judgement, one way or the other).
      if (
        (COMBO_MILESTONES as readonly number[]).includes(this.combo) &&
        this.combo !== this.lastMilestone
      ) {
        this.lastMilestone = this.combo;
        this.comboMilestone = { value: this.combo, at: performance.now() };
        const tier = COMBO_MILESTONES.indexOf(this.combo as (typeof COMBO_MILESTONES)[number]);
        this.audioManager.playSfX(
          660 + tier * 110,
          'sine',
          0.16 + tier * 0.02,
          useSliceItStore.getState().sfxVolume / 100,
        );
      }
    }

    if (result !== 'MISS') {
      this.score += pointsFor(result, this.combo, scoreMultiplier);
      if (slice.type === 'LONG') {
        this.activeHolds.set(lane, slice);
        this.holdBilledTo.set(lane, this.now());
      }

      const sfxVolume = store.sfxVolume / 100;
      const hitSound = store.hitSound;
      const clean = result === 'MARVELOUS' || result === 'PERFECT';
      if (hitSound && hitSound !== 'default') {
        this.audioManager.playHitSoundFile(
          asset(`/music/slice-it/sounds/${hitSound}`),
          sfxVolume,
          clean ? 1.0 : 0.85,
        );
      } else {
        this.audioManager.playSfX(clean ? 880 : 440, 'triangle', 0.1, sfxVolume);
      }
    }

    const offset = offsetSeconds ?? this.now() - slice.time;
    if (result !== 'MISS') this.recordOffset(offset);
    // For a hit, `slice.time + offset` is the moment the input happened — the
    // same reconstruction `submitInput` judged from, not the moment the engine
    // got around to it. Recording the clock instead would bake this machine's
    // frame pacing and event-queue latency into the log, and R8 re-judges
    // against the chart with these numbers.
    //
    // For a miss there was no input, and the sweep's clock reading is a full
    // miss-window *after* the note — far enough on a dense chart to sit nearer
    // the following note than its own, which is exactly the ambiguity a
    // re-judge cannot resolve. A missed note is logged at the note's own time,
    // which is the one unambiguous thing about it.
    this.recordReplay(lane, result, offsetSeconds === undefined ? slice.time : slice.time + offset);
    this.pushFeedback(result, lane, FEEDBACK_COLORS[result], offset);
    // Last, so the histogram and the combo are already updated if this ends the
    // run — the results screen must describe the note that killed you.
    if (result !== 'NONE') {
      this.applyHealth(result);
      this.checkFailConditions(result);
      this.feedbackHaptic(result);
    }
    this.commit();
  }

  /**
   * Drop the combo, and say so when there was something to drop.
   *
   * Every path that zeroes the combo goes through here — a missed note, a ghost
   * tap, a sliced bomb, a dropped hold — because otherwise "the combo broke" is
   * an event with five separate definitions and the feedback only fires for
   * some of them.
   *
   * Below {@link COMBO_BREAK_THRESHOLD} nothing is recorded at all: the run is
   * still finding its feet and a reaction to every early miss is nagging, not
   * information.
   */
  private breakCombo(): void {
    const lost = this.combo;
    this.combo = 0;
    if (lost < COMBO_BREAK_THRESHOLD) return;

    this.comboBreak = {
      at: performance.now(),
      magnitude: Math.min(1, lost / COMBO_BREAK_FULL_INTENSITY),
    };
    // A low square tone, not a sample: there is no combo-break asset in the
    // repo, and adding a fetch to the miss path is how a missed note becomes a
    // frame hitch that costs the next one too.
    this.audioManager.playSfX(110, 'square', 0.22, useSliceItStore.getState().sfxVolume / 100);
  }

  /**
   * The most recent combo break worth drawing, or null. Read once per frame by
   * the renderer, which decides for itself when it has gone stale.
   */
  getComboBreak(): { at: number; magnitude: number } | null {
    return this.comboBreak;
  }

  /** The most recent combo-milestone crossing worth drawing, or null. */
  getComboMilestone(): { value: number; at: number } | null {
    return this.comboMilestone;
  }

  /**
   * A8 — a short vibration scaled by how well the note was hit.
   *
   * Never during replay/autoplay review: this is feedback for a hand resting
   * on a device right now, not a description of a run that already happened,
   * and `stepReplay` re-runs every resolution from the original run through
   * this same code path.
   */
  private feedbackHaptic(result: Exclude<HitResult, 'NONE'>): void {
    if (this.replayInput !== null) return;
    if (!hapticsEnabled()) return;
    vibrate(Math.round(HAPTIC_MS[result] * hapticsIntensity()));
  }

  /* ── Health gauge ──────────────────────────────────────────────────────── */

  /** Move the gauge by a judgement's delta. A no-op while the modifier is off. */
  private applyHealth(result: Exclude<HitResult, 'NONE'>): void {
    this.drainHealth(-HEALTH_DELTA[result]);
  }

  /**
   * Move the gauge by `amount` points of drain (negative heals), and act on
   * zero.
   *
   * Recovery above zero is allowed after a break because the gauge is a *live*
   * readout, but {@link gaugeBroken} is sticky: the bonus is forfeited for the
   * rest of the run whatever the bar does afterwards.
   */
  private drainHealth(amount: number): void {
    if (!useSliceItStore.getState().modifiers.healthGauge) return;
    this.health = Math.max(0, Math.min(HEALTH_MAX, this.health - amount));
    if (this.health > 0) return;

    this.gaugeBroken = true;
    this.fail('health');
  }

  /**
   * End the run outright for a fail-condition modifier — the health gauge
   * draining to zero, or (M6) Perfectionist landing below PERFECT.
   *
   * The multiplayer guard and the `finished` re-entrancy check live here once
   * rather than in every caller, so a second fail condition tripping in the
   * same frame (the gauge breaking on the same judgement that also failed
   * Perfectionist) can't re-run the "stop the song, flip the status" sequence
   * twice or overwrite the reason that actually got there first.
   */
  private fail(reason: 'health' | 'perfectionist'): void {
    // Multiplayer: the run continues, the multiplier does not. Perfectionist
    // never reaches here in a match at all — `forMultiplayer` (`modifiers.ts`)
    // strips it before the modifiers ever land in the store — but the guard
    // stays, for the same reason `checkFailConditions` re-checks the modifier
    // itself rather than trusting that upstream cleanup ran.
    if (this.failMode === 'survive') return;
    if (this.finished) return;

    this.finished = true;
    this.failed = true;
    this.failReason = reason;
    this.audioManager.stop();
    // `FINISHED`, not a new `FAILED` status. The store's `GameStatus` is read by
    // every screen in the game and a third value would have to be handled by all
    // of them; what the results screen needs to say "you failed" — and why —
    // is the flag on this engine, which it already holds. See
    // `getRunStats().failed`/`.failReason`.
    useSliceItStore.getState().setStatus('FINISHED');
  }

  /**
   * M6 — Perfect-or-die. Anything below PERFECT ends the run.
   *
   * Called from every place a `HitResult` is produced for a real note — a tap,
   * a hold release, and the hold-timeout sweep's synthetic MISS — so the rule
   * is "any judged note", not "any tapped note". A ghost tap and a sliced
   * bomb don't produce a `HitResult` at all and so never reach here, which is
   * correct: neither is a note the chart asked the player to judge.
   */
  private checkFailConditions(result: Exclude<HitResult, 'NONE'>): void {
    const modifiers = useSliceItStore.getState().modifiers;
    if (modifiers.perfectionist && result !== 'MARVELOUS' && result !== 'PERFECT') {
      this.fail('perfectionist');
    }
    // Sudden Death has no engine-side effect to guard here: `suddenDeath` ends
    // nothing today (see `docs/_handoff/note-vocab-requests.md`). The
    // exclusion that keeps Perfectionist from double-paying its bonus if
    // Sudden Death is ever wired up lives at the modifier level regardless —
    // `applyExclusions` in `modifiers.ts` — so this function needs no update
    // when that lands.
  }

  /**
   * Record how far a hit landed from its note, for the run's timing summary.
   *
   * A person's timing errors scatter: even an expert's offsets have a standard
   * deviation of 10–25 ms, and the distribution drifts as a song goes on. A
   * program pressing at `slice.time` has a standard deviation near zero, and no
   * amount of skill produces that. Keeping the summary — not the samples — is
   * enough to tell those apart and is a few numbers on the wire.
   */
  private recordOffset(offsetSeconds: number): void {
    if (!Number.isFinite(offsetSeconds)) return;
    this.offsetCount++;
    // Welford, so the variance is stable and needs no second pass over samples
    // we are deliberately not keeping.
    const delta = offsetSeconds - this.offsetMean;
    this.offsetMean += delta / this.offsetCount;
    this.offsetM2 += delta * (offsetSeconds - this.offsetMean);

    // …and the last few samples verbatim, which the summary cannot reconstruct
    // and the error bar needs. Client-side only: the submission still carries
    // three numbers, not a per-note payload. See `integrity.ts`.
    this.offsetRing.offsets[this.offsetHead] = offsetSeconds;
    this.offsetRing.times[this.offsetHead] = performance.now();
    this.offsetHead = (this.offsetHead + 1) % OFFSET_RING_SIZE;
  }

  /**
   * The run's timing summary, or null when too few notes were hit to say
   * anything. Sent with the score; see `lib/slice-it/integrity.ts`.
   */
  getTimingSummary(): TimingSummary | null {
    if (this.offsetCount < MIN_TIMING_SAMPLES) return null;
    return this.getTimingStats();
  }

  /**
   * The same numbers, ungated.
   *
   * {@link getTimingSummary} withholds a summary below {@link MIN_TIMING_SAMPLES}
   * because a mean over five notes is noise and the server should not be asked
   * to reason about it. The renderer has the opposite problem: the error bar's
   * mean marker has to be somewhere from the first hit. `samples` is returned so
   * every caller can apply its own threshold — and P5's offset suggestion
   * deliberately applies a stricter one than this.
   */
  getTimingStats(): TimingSummary {
    return {
      samples: this.offsetCount,
      meanMs: this.offsetCount > 0 ? this.offsetMean * 1000 : 0,
      stdDevMs:
        this.offsetCount > 0 ? Math.sqrt(Math.max(0, this.offsetM2 / this.offsetCount)) * 1000 : 0,
    };
  }

  /**
   * The recent signed hit offsets, for the early/late bar.
   *
   * Returned by reference and never copied — the caller reads it once per frame.
   * A slot whose `times` entry is 0 was never written.
   */
  getRecentOffsets(): { readonly offsets: Float32Array; readonly times: Float32Array } {
    return this.offsetRing;
  }

  /** The hit-window scale this run is being judged at. Widest window × this. */
  getTimingScale(): number {
    return timingScale(useSliceItStore.getState().modifiers);
  }

  /* ── Replay capture (R3) ───────────────────────────────────────────────── */

  /**
   * Append one resolution to the input log.
   *
   * Every write here is a number into an array that already exists — no
   * allocation, no string, no property lookup on a fresh object — because this
   * runs inside `resolve`, which runs on the input path and on the frame path.
   *
   * Two clamps, both of which exist so the log passes the schema that will read
   * it back rather than being rejected whole at submission:
   *
   * - **Monotonic `t`.** `verifySliceIt` rejects a log whose timestamps go
   *   backwards, and they legitimately can by a few milliseconds: the miss sweep
   *   stamps a note at the current clock while a press in the same frame stamps
   *   itself at its own `event.timeStamp`, which is a little earlier. That is
   *   dispatch latency, not tampering, so it is flattened to the previous value
   *   instead of being allowed to fail an honest run's replay.
   * - **Bounded `t`.** The schema caps a replay at one hour of track.
   *
   * @param atSeconds When the input happened, in audio time.
   */
  private recordReplay(lane: number, result: HitResult, atSeconds: number): void {
    // Playback re-runs `resolve` for every logged input; re-recording them would
    // be writing the log back over itself.
    if (this.replayInput !== null) return;

    const code = JUDGMENT_CODE[result];
    if (code === NOT_RECORDED) return;

    const index = this.replayCount;
    if (index >= REPLAY_MAX_INPUTS) {
      this.replayTruncated = true;
      return;
    }

    const bounded = atSeconds > 0 ? (atSeconds < 3600 ? atSeconds : 3600) : 0;
    const ms = Math.round(bounded * 1000);
    const previous = index > 0 ? this.replayTimes[index - 1] : 0;
    this.replayTimes[index] = ms < previous ? previous : ms;
    this.replayLanes[index] = lane > 0 ? (lane < 7 ? lane : 7) : 0;
    this.replayJudgments[index] = code;
    this.replayCount = index + 1;
  }

  /** How many resolutions the log holds, and whether it hit its ceiling. */
  getReplayStats(): { count: number; truncated: boolean } {
    return { count: this.replayCount, truncated: this.replayTruncated };
  }

  /** The recorded log, materialised into the shape the shared schema stores. */
  getReplayLog(): ReplayInput[] {
    return buildReplayInputs(
      this.replayTimes,
      this.replayLanes,
      this.replayJudgments,
      this.replayCount,
    );
  }

  /**
   * The full replay payload for this run, or null when there is nothing to
   * store.
   *
   * Assembled here rather than at the call site because the engine is the only
   * thing that holds all four parts at once: the track it loaded, the log it
   * recorded, and — through the store — the modifier set the chart was generated
   * under, which is what makes the log replayable at all.
   */
  getReplay(): SliceItReplay | null {
    if (this.replayCount === 0 || !this.songId) return null;
    const modifiers = useSliceItStore.getState().modifiers;
    return {
      track: this.songId,
      seed: replaySeed(this.songId, modifiers),
      mods: replayMods(modifiers),
      inputs: this.getReplayLog(),
    };
  }

  /* ── Replay playback (R4) ──────────────────────────────────────────────── */

  /**
   * Put this engine into playback: the log becomes the input device.
   *
   * This is autoplay with a different oracle. Autoplay resolves each note at its
   * own time with a perfect judgement; a replay resolves at the *logged* time
   * with the *logged* judgement, through the same `resolve` every real press
   * goes through — which is why the score, the combo, the health gauge, the
   * feedback text and the timing bar all come out of a replay the way they came
   * out of the run, without a second implementation of any of them.
   *
   * The chart must already be loaded (`loadMap`) under the replay's modifiers,
   * or the notes the log refers to are not the notes on screen.
   */
  loadReplay(inputs: ReplayInput[]): void {
    this.replayInput = inputs;
    this.replayCursor = 0;
    this.replayTime = 0;
  }

  /** True while this engine is playing a log back. */
  isReplay(): boolean {
    return this.replayInput !== null;
  }

  /**
   * Advance playback to `seconds` and resolve everything the log says happened
   * up to it. Called once per frame by the viewer, which owns the clock.
   */
  advanceReplay(seconds: number): void {
    if (this.replayInput === null) return;
    // Never backwards: `update` and the miss sweep both assume a clock that only
    // moves forward. Going back in time is `seekReplay`, which re-simulates.
    this.replayTime = Math.max(this.replayTime, seconds);
    this.update();
  }

  /**
   * Scrub to `seconds`.
   *
   * Re-simulates from the beginning rather than trying to unwind: the run's
   * state at a moment is a function of every input before it (combo, health, the
   * accuracy denominator, which holds are open), and the only honest way to get
   * that state is to replay the inputs that produced it. A three-minute log is a
   * few thousand array reads, which is a fraction of one frame — cheap enough
   * that scrubbing does not need to be incremental, and correct in a way that an
   * incremental version would have to keep proving.
   */
  seekReplay(seconds: number): void {
    const log = this.replayInput;
    if (log === null) return;

    const target = Math.max(0, seconds);
    // `update` refuses to run unless the store says a run is live, which is
    // correct for a game and wrong for a scrub: seeking a *paused* replay is the
    // normal case. The two flags are forced for the duration of the
    // re-simulation and put back exactly as they were.
    const before = useSliceItStore.getState();
    const wasPaused = before.isPaused;
    const wasStatus = before.status;

    // `reset` clears the cursor and every counter. It does not clear the log —
    // in playback the log is the input device, not run state.
    this.reset();
    this.replayCursor = 0;
    this.replayTime = 0;

    const store = useSliceItStore.getState();
    store.setStatus('PLAYING');
    store.setIsPaused(false);

    // Step the clock to each logged input in turn, so the miss sweep and the
    // hold accrual see the same sequence of times they saw live. Landing
    // straight on `target` would resolve every input in one frame and pay a
    // three-minute hold at a single billing step.
    for (const input of log) {
      const at = input.t / 1000;
      if (at > target) break;
      this.replayTime = at;
      this.update();
    }
    this.replayTime = target;
    this.update();

    const after = useSliceItStore.getState();
    if (wasStatus !== 'PLAYING') after.setStatus(wasStatus);
    if (wasPaused) after.setIsPaused(true);
  }

  /** Playback position in seconds, for a scrubber. */
  getReplayTime(): number {
    return this.replayTime;
  }

  /**
   * Resolve every logged input at or before `now`.
   *
   * Holds are the one thing the log cannot describe: it records resolutions, and
   * a release is not one. A LONG note whose head was hit is therefore released
   * here at its own end time, which is what a run that scored `HOLD OK` did —
   * left alone it would sit open until the sweep expired it and break a combo
   * the run never broke.
   */
  private stepReplay(now: number): void {
    const log = this.replayInput;
    if (log === null) return;

    for (const [lane, slice] of this.activeHolds) {
      if (now >= slice.time + (slice.duration ?? 0)) this.submitRelease(lane);
    }

    while (this.replayCursor < log.length) {
      const input = log[this.replayCursor];
      const at = input.t / 1000;
      if (at > now) break;
      this.replayCursor++;

      const lane = input.lane ?? 0;
      const slice = this.getTargetedSlice(lane);
      // No note under this input means the log and the chart disagree — a
      // different difficulty, an edited chart, a modifier set the payload did
      // not carry. Skipped rather than forced: inventing a resolution would make
      // the viewer show a run that never happened.
      if (!slice) continue;
      this.resolve(slice, REPLAY_TO_HIT_RESULT[input.judgment], lane, at - slice.time);
    }
  }

  /* ── Derived run state ─────────────────────────────────────────────────── */

  /**
   * Nothing missed and nothing BAD.
   *
   * Derived from the histogram rather than tracked as its own flag: a separate
   * boolean is a second source of truth that can disagree with the numbers
   * printed next to it, and this one would be read mid-run on every frame.
   */
  get isFullCombo(): boolean {
    return this.judgements.MISS === 0 && this.judgements.BAD === 0;
  }

  /** Every resolved note was MARVELOUS. False before anything is resolved. */
  get isPerfect(): boolean {
    return this.notesResolved > 0 && this.judgements.MARVELOUS === this.notesResolved;
  }

  /** The full run tally, for the results screen. */
  getRunStats(): RunStats {
    return {
      score: this.score,
      maxCombo: this.maxCombo,
      accuracy: accuracyOf(this.hitPoints, this.notesResolved),
      notesResolved: this.notesResolved,
      judgements: { ...this.judgements },
      health: this.health,
      gaugeBroken: this.gaugeBroken,
      failed: this.failed,
      failReason: this.failReason,
      isFullCombo: this.isFullCombo,
      isPerfect: this.isPerfect,
    };
  }

  private pushFeedback(text: string, lane: number, color: string, offset?: number): void {
    this.feedbackQueue.push({
      id: this.feedbackIdCounter++,
      text,
      lane,
      time: performance.now(),
      color,
      ...(offset !== undefined ? { offset } : {}),
    });
    if (this.feedbackQueue.length > 20) this.feedbackQueue.shift();
  }

  /** Push the run's state into the store the HUD reads. */
  private commit(): void {
    const store = useSliceItStore.getState();
    store.setScore(this.score, this.combo, this.speedMultiplier);
    store.setAccuracy(accuracyOf(this.hitPoints, this.notesResolved));
    store.setMaxCombo(this.maxCombo);
  }

  /**
   * Publish this run's score to the lobby.
   *
   * On a wall-clock interval, not a per-frame probability: the old
   * `Math.random() < 0.05` meant a 144Hz display emitted twice as often as a
   * 60Hz one, so the best hardware in the room generated the most traffic.
   */
  private publish(final: boolean): void {
    const now = performance.now();
    if (!final && now - this.lastReportAt < SCORE_REPORT_INTERVAL_MS) return;
    this.lastReportAt = now;

    const report = {
      score: this.score,
      combo: this.combo,
      maxCombo: this.maxCombo,
      accuracy: accuracyOf(this.hitPoints, this.notesResolved),
      // The real gauge, or a full bar when the modifier is off — which is what
      // the sidebar has been drawing all along, except now it means something
      // for the seats that opted in. It never reaches zero *and* ends a run
      // here: `failMode` is `'survive'` for the whole of a match.
      health: this.health,
    };

    // `reportFinish` queues through the client's outbox, so a drop in the last
    // second of a song does not cost the player their result; `reportScore`
    // deliberately does not, because a stale score flushed four seconds later
    // is worse than a gap on the sidebar.
    if (final) reportFinish(report);
    else reportScore(report);
  }
}
