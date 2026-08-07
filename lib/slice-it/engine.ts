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
  HIT_WINDOWS,
  HOLD_RELEASE_POINTS,
  HOLD_TICK_MAX_STEP_SEC,
  HOLD_TICK_POINTS_PER_SECOND,
  INPUT_COOLDOWN_MS,
  STRICT_TIMING_FACTOR,
} from './constants';
import type { BeatMap, HitResult, Slice } from './types';
import { MIN_TIMING_SAMPLES, type TimingSummary } from './integrity';
import { SECTION_SECONDS, type SectionResult } from './ai/facts';
import { prepareChart } from './chart';
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

/** A zeroed judgement histogram. Rebuilt on every `reset()`. */
function emptyJudgements(): Record<Exclude<HitResult, 'NONE'>, number> {
  return { MARVELOUS: 0, PERFECT: 0, GREAT: 0, GOOD: 0, BAD: 0, MISS: 0 };
}

/** Colours the feedback text is drawn in, per judgement. */
const FEEDBACK_COLORS: Record<HitResult, string> = {
  MARVELOUS: '#0891b2',
  PERFECT: '#B4954A',
  GREAT: '#15803d',
  GOOD: '#1d4ed8',
  BAD: '#7e22ce',
  MISS: '#64748b',
  NONE: '#64748b',
};

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

  private inMultiplayer = false;
  private lastReportAt = 0;
  private finished = false;

  /** Running mean/variance of hit timing error (Welford). See `recordOffset`. */
  private offsetCount = 0;
  private offsetMean = 0;
  private offsetM2 = 0;

  /** Judgement histogram for the run. See `getRunJudgements`. */
  private judgements: Record<Exclude<HitResult, 'NONE'>, number> = emptyJudgements();
  /**
   * Per-section tally, keyed by `floor(noteTime / SECTION_SECONDS)`.
   *
   * Keyed on the note's time in the CHART, not on the wall clock, so a run at
   * 1.5x speed reports the same sections as one at 1.0x — "the bit at 1:40" has
   * to mean the same place in the song however fast it was played.
   */
  private sections = new Map<number, { hit: number; missed: number; weight: number }>();

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

  /** True while this run is part of a multiplayer match. */
  setMultiplayer(value: boolean): void {
    this.inMultiplayer = value;
  }

  async loadMap(map: BeatMap, preloadedBuffer?: AudioBuffer): Promise<void> {
    const store = useSliceItStore.getState();
    const modifiers = store.modifiers;

    this.beatMap = map;
    this.songId = map.id;
    // Deterministic: same song + same settings ⇒ same notes, on a retry and on
    // every machine in a lobby.
    this.slices = prepareChart(map, modifiers).sort((a, b) => a.time - b.time);

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

  reset(): void {
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
    this.offsetCount = 0;
    this.offsetMean = 0;
    this.offsetM2 = 0;
    this.judgements = emptyJudgements();
    this.sections.clear();

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

  /** Current playback position, adjusted by the player's calibration offset. */
  private now(): number {
    const offsetSeconds = (useSliceItStore.getState().audioOffset || 0) / 1000;
    return this.audioManager.getCurrentTime() - offsetSeconds;
  }

  private get strictFactor(): number {
    return useSliceItStore.getState().modifiers.strictTiming ? STRICT_TIMING_FACTOR : 1;
  }

  /** The full miss window in seconds, at the current speed and strictness. */
  private get missWindow(): number {
    return HIT_WINDOWS.BAD * this.strictFactor * this.speedMultiplier;
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

    const modifiers = store.modifiers;
    const scoreMultiplier = calculateScoreMultiplier(modifiers);
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
        if (currentTime > holdEnd + missWindow) {
          this.activeHolds.delete(lane);
          this.holdBilledTo.delete(lane);
          this.combo = 0;
          this.pushFeedback('MISS', lane, FEEDBACK_COLORS.MISS);
          store.setScore(this.score, this.combo, this.speedMultiplier);
          store.setMaxCombo(this.maxCombo);
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
      this.combo = 0;
      this.pushFeedback('MISS', lane, FEEDBACK_COLORS.MISS);
      this.commit();
      return;
    }

    if (targeted.type === 'BOMB') {
      this.processedSliceIds.add(targeted.id);
      this.combo = 0;
      this.score = Math.max(0, this.score - BOMB_PENALTY);
      this.pushFeedback('BOMB!', lane, '#ff0000');
      this.audioManager.playSfX(150, 'sawtooth', 0.3, store.sfxVolume / 100);
      this.commit();
      return;
    }

    const result = judge(currentTime - targeted.time, timingScale(store.modifiers));
    this.resolve(targeted, result, this.getEffectiveLane(targeted, currentTime));
  }

  submitRelease(lane: number): void {
    const held = this.activeHolds.get(lane);
    if (!held) return;
    this.activeHolds.delete(lane);
    this.holdBilledTo.delete(lane);

    const store = useSliceItStore.getState();
    const currentTime = this.now();
    const holdEnd = held.time + (held.duration ?? 0);
    const scoreMultiplier = calculateScoreMultiplier(store.modifiers);
    const window = this.missWindow;
    const comboFactor = this.combo > 0 ? this.combo : 1;

    if (currentTime >= holdEnd - window && currentTime <= holdEnd + window) {
      this.score += Math.floor(HOLD_RELEASE_POINTS * comboFactor * scoreMultiplier);
      this.pushFeedback('HOLD OK', lane, '#0891b2');
    } else {
      // Dropped early — partial credit for the part you held, but the combo
      // goes, because the note was not completed.
      const total = held.duration ?? 0;
      const ratio = total > 0 ? Math.min(1, Math.max(0, (currentTime - held.time) / total)) : 0;
      this.score += Math.floor(HOLD_RELEASE_POINTS * ratio * comboFactor * scoreMultiplier);
      this.combo = 0;
      this.pushFeedback('DROPPED', lane, '#64748b');
    }
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
      score: this.score,
      combo: this.combo,
      maxCombo: this.maxCombo,
      accuracy: accuracyOf(this.hitPoints, this.notesResolved),
      multiplier: this.speedMultiplier,
      currentTime: this.audioManager.getCurrentTime(),
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

  private resolve(slice: Slice, result: HitResult, lane: number): void {
    this.processedSliceIds.add(slice.id);
    slice.hit = result !== 'MISS';
    slice.hitTime = performance.now();

    const store = useSliceItStore.getState();
    const scoreMultiplier = calculateScoreMultiplier(store.modifiers);

    this.notesResolved++;
    const weight = accuracyWeight(result);
    this.hitPoints += weight;
    this.recordSection(slice.time, result, weight);
    if (result !== 'NONE') this.judgements[result]++;

    if (result === 'MISS' || result === 'BAD') {
      this.combo = 0;
    } else {
      this.combo++;
      this.maxCombo = Math.max(this.maxCombo, this.combo);
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

    const offset = this.now() - slice.time;
    if (result !== 'MISS') this.recordOffset(offset);
    this.pushFeedback(result, lane, FEEDBACK_COLORS[result], offset);
    this.commit();
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
  }

  /**
   * The run's timing summary, or null when too few notes were hit to say
   * anything. Sent with the score; see `lib/slice-it/integrity.ts`.
   */
  getTimingSummary(): TimingSummary | null {
    if (this.offsetCount < MIN_TIMING_SAMPLES) return null;
    return {
      samples: this.offsetCount,
      meanMs: this.offsetMean * 1000,
      stdDevMs: Math.sqrt(Math.max(0, this.offsetM2 / this.offsetCount)) * 1000,
    };
  }

  /**
   * Tally one resolved note into the section of the chart it belongs to.
   *
   * A tally rather than a list of notes, for the reason `integrity.ts` gives
   * about timing samples: three counters per ten seconds of song is a handful
   * of numbers on the wire, while per-note results are a payload proportional
   * to the chart. It is enough to answer the only question the coach asks of
   * it — *where* in the song did this run come apart.
   */
  private recordSection(noteTime: number, result: HitResult, weight: number): void {
    if (!Number.isFinite(noteTime)) return;
    const index = Math.max(0, Math.floor(noteTime / SECTION_SECONDS));
    const bucket = this.sections.get(index) ?? { hit: 0, missed: 0, weight: 0 };
    if (result === 'MISS') bucket.missed++;
    else bucket.hit++;
    bucket.weight += weight;
    this.sections.set(index, bucket);
  }

  /** The run's judgement histogram. */
  getRunJudgements(): Record<Exclude<HitResult, 'NONE'>, number> {
    return { ...this.judgements };
  }

  /**
   * How each section of the chart went, ascending by section.
   *
   * Sections the run never reached are absent rather than reported as 0% — an
   * abandoned run should not read as one that missed the whole back half.
   */
  getSectionResults(): SectionResult[] {
    return [...this.sections.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([index, bucket]) => {
        const notes = bucket.hit + bucket.missed;
        return {
          index,
          hit: bucket.hit,
          missed: bucket.missed,
          accuracy: notes > 0 ? bucket.weight / (notes * 100) : 0,
        };
      });
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
      health: 100,
    };

    // `reportFinish` queues through the client's outbox, so a drop in the last
    // second of a song does not cost the player their result; `reportScore`
    // deliberately does not, because a stale score flushed four seconds later
    // is worse than a gap on the sidebar.
    if (final) reportFinish(report);
    else reportScore(report);
  }
}
