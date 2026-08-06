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
  HOLD_TICK_POINTS,
  INPUT_COOLDOWN_MS,
  STRICT_TIMING_FACTOR,
} from './constants';
import type { BeatMap, HitResult, Slice } from './types';
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

/** How often a live score is published to the lobby, ms. */
const SCORE_REPORT_INTERVAL_MS = 400;

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
    if (this.activeHolds.size > 0) {
      for (const [lane, slice] of this.activeHolds) {
        const holdEnd = slice.time + (slice.duration ?? 0);
        if (currentTime > holdEnd + missWindow) {
          this.activeHolds.delete(lane);
          this.combo = 0;
          this.pushFeedback('MISS', lane, FEEDBACK_COLORS.MISS);
          store.setScore(this.score, this.combo, this.speedMultiplier);
          store.setMaxCombo(this.maxCombo);
        } else if (currentTime < holdEnd) {
          this.score += Math.floor(
            HOLD_TICK_POINTS * (this.combo > 0 ? this.combo : 1) * scoreMultiplier,
          );
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

  submitInput(lane: number): void {
    const store = useSliceItStore.getState();
    if (store.isPaused) return;

    // One press must never resolve two notes.
    const now = performance.now();
    if (now - (this.lastInputTime.get(lane) ?? 0) < INPUT_COOLDOWN_MS) return;
    this.lastInputTime.set(lane, now);

    if (!this.beatMap) return;

    const currentTime = this.now();
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
      score: this.score,
      combo: this.combo,
      maxCombo: this.maxCombo,
      accuracy: accuracyOf(this.hitPoints, this.notesResolved),
      multiplier: this.speedMultiplier,
      currentTime: this.audioManager.getCurrentTime(),
    };
  }

  /* ─── Internals ───────────────────────────────────────────────────────── */

  private resolve(slice: Slice, result: HitResult, lane: number): void {
    this.processedSliceIds.add(slice.id);
    slice.hit = result !== 'MISS';
    slice.hitTime = performance.now();

    const store = useSliceItStore.getState();
    const scoreMultiplier = calculateScoreMultiplier(store.modifiers);

    this.notesResolved++;
    this.hitPoints += accuracyWeight(result);

    if (result === 'MISS' || result === 'BAD') {
      this.combo = 0;
    } else {
      this.combo++;
      this.maxCombo = Math.max(this.maxCombo, this.combo);
    }

    if (result !== 'MISS') {
      this.score += pointsFor(result, this.combo, scoreMultiplier);
      if (slice.type === 'LONG') this.activeHolds.set(lane, slice);

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

    this.pushFeedback(result, lane, FEEDBACK_COLORS[result], this.now() - slice.time);
    this.commit();
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
