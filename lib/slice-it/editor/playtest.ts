'use client';

/**
 * Slice It chart editor — playtest.
 *
 * Design doc: `docs/slice-it-chart-editor.md` §10.
 *
 * Playtest is `GameEngine` on the edited chart. **Not a second implementation**:
 * two renderers that disagree about note position is exactly the bug an editor
 * exists to prevent, and two *judges* that disagree about a hit window is the
 * same bug one layer down. So the real engine loads the working notes, judges
 * the author's presses, and the editor's own timeline draws the result — one
 * simulation, one renderer.
 *
 * ## A playtest can never reach the leaderboard
 *
 * Structurally, not by hiding a button:
 *
 *  1. The map is minted with an `editor:` id, and {@link assertSubmittable}
 *     throws on one. Anything that acquires a playtest map and tries to score it
 *     has to go through that check.
 *  2. {@link PlaytestSession} never exposes its engine. `useSubmitScore` takes a
 *     `RunSummary` (score, accuracy, maxCombo, runToken); the session has no
 *     accessor that returns any of those — {@link PlaytestSession.runSummary}
 *     exists only to throw, so the path is closed rather than merely unused.
 *  3. No run token is ever minted. `/api/slice-it/score` verifies one against a
 *     real song id (`run-token.server.ts`), and the editor never asks for one, so
 *     even a hand-built submission is rejected server-side.
 *
 * `GameEngine` takes no constructor options today, so (1) and (2) are the
 * editor-side expression of the `new GameEngine({ submitting: false })` the
 * design doc writes. The engine-side flag is filed in
 * `docs/_handoff/editor-phase45-requests.md`.
 */

import { AudioManager } from '@/lib/audio/AudioManager';
import { GameEngine, type Feedback } from '@/lib/slice-it/engine';
import { DEFAULT_MODIFIERS } from '@/lib/slice-it/modifiers';
import { useSliceItStore } from '@/lib/slice-it/store';
import type { BeatMap, Modifiers, Slice } from '@/lib/slice-it/types';
import { editorState } from './store';
import { toSlices } from './types';
import type { EditorNote } from './types';

/** Every map built for a playtest carries this. It is the run's passport. */
export const EDITOR_MAP_PREFIX = 'editor:';

export function editorMapId(songId: string): string {
  return `${EDITOR_MAP_PREFIX}${songId}`;
}

export function isEditorMapId(id: string | null | undefined): boolean {
  return typeof id === 'string' && id.startsWith(EDITOR_MAP_PREFIX);
}

export class PlaytestForbiddenError extends Error {
  constructor(message = 'A playtest run cannot be scored or submitted.') {
    super(message);
    this.name = 'PlaytestForbiddenError';
  }
}

/**
 * The boundary. Throws for anything that came out of the editor.
 *
 * Deliberately a throw and not a `false`: a caller that forgets to check a
 * boolean submits an editor run to the leaderboard, and a caller that forgets to
 * catch this gets a stack trace pointing at the exact line that tried.
 */
export function assertSubmittable(mapId: string | null | undefined): void {
  if (isEditorMapId(mapId)) throw new PlaytestForbiddenError();
}

/** The song fields a playtest needs — a subset of the editor's `EditorSong`. */
export interface PlaytestSong {
  id: string;
  title: string;
  artist: string;
  audioUrl: string;
  bpm: number;
}

/**
 * Build the `BeatMap` the engine plays.
 *
 * `toSlices` drops the editor's own fields (`selected` / `auto` / `issues`) — the
 * engine writes `hit`/`hitTime` onto the slices it prepares, and handing it
 * objects that also carry editor state would let a stale `selected` flag ride
 * into the game's renderer.
 */
export function buildPlaytestMap(song: PlaytestSong, notes: readonly EditorNote[]): BeatMap {
  return {
    id: editorMapId(song.id),
    name: song.title,
    artist: song.artist,
    audioUrl: song.audioUrl,
    bpm: song.bpm > 0 ? song.bpm : 120,
    slices: toSlices(notes),
  };
}

/** What the timeline draws for one resolved note (§4.4a). */
export interface HitMark {
  /** True when the note was hit, false when it expired unhit. */
  hit: boolean;
  /** `performance.now()` at resolution, for the fade. */
  at: number;
}

export interface PlaytestStartInput {
  song: PlaytestSong;
  notes: readonly EditorNote[];
  /** Where the transport starts. Never 0 unless the author is at 0 (§10). */
  from: number;
  /** Loop the selection: plays this range on repeat until stopped. */
  loop?: { start: number; end: number } | null;
}

/** The AudioManager cannot seek — see the note on {@link seekAudio}. */
interface SeekableAudio {
  pauseTime: number;
}

/**
 * Start playback at an arbitrary position.
 *
 * `AudioManager` exposes `play` / `pause` / `stop` but no seek: `play()` resumes
 * from a private `pauseTime` that only `pause()` ever writes. The replay viewer
 * hit this first and gave up audio entirely (`engine.ts`, "Replay playback"
 * section; `docs/_handoff/replay-requests.md`). Playtest cannot — "play the bar
 * at 2:40" with no sound is not a playtest — so it writes the field it needs
 * through a narrow structural type, having first `stop()`ped so the manager's own
 * bookkeeping is at a known zero. The two-line `seek(seconds)` that makes this
 * honest is requested in `docs/_handoff/editor-phase45-requests.md`.
 */
function seekAudio(audio: AudioManager, seconds: number): void {
  audio.stop();
  (audio as unknown as SeekableAudio).pauseTime = Math.max(0, seconds);
}

/** The game-store fields a playtest borrows and must hand back. */
interface StoreSnapshot {
  status: ReturnType<typeof useSliceItStore.getState>['status'];
  isPaused: boolean;
  songId: string | null;
  modifiers: Modifiers;
}

let active: PlaytestSession | null = null;

/**
 * The running playtest, if any.
 *
 * A module singleton for the same reason `editorState()` is one: the timeline's
 * draw loop needs it every frame and must not re-render to get it. There is only
 * ever one — the engine drives one AudioManager, and two playtests would fight
 * over it.
 */
export function activePlaytest(): PlaytestSession | null {
  return active;
}

export class PlaytestSession {
  /**
   * A `#private` field, not a TypeScript `private` one, and that is the point:
   * `private` is erased at runtime, so `(session as any).engine.getState()` would
   * hand a caller the score. `#engine` is unreachable from outside this class in
   * the emitted JavaScript — the no-submit guarantee is a property of the
   * program, not of the type checker.
   */
  readonly #engine: GameEngine;
  private readonly audio: AudioManager;
  private readonly map: BeatMap;
  private readonly snapshot: StoreSnapshot;
  private readonly hits = new Map<string, HitMark>();
  private buffer: AudioBuffer | null = null;
  private loop: { start: number; end: number } | null;
  private startedFrom: number;
  private lastTime: number;
  private scanCursor = 0;
  private wrapping = false;
  private stopped = false;

  private constructor(map: BeatMap, snapshot: StoreSnapshot, from: number) {
    this.#engine = new GameEngine();
    this.audio = AudioManager.getInstance();
    this.map = map;
    this.snapshot = snapshot;
    this.loop = null;
    this.startedFrom = from;
    this.lastTime = from;
  }

  /**
   * Load the edited chart into the engine and play from `from`.
   *
   * The game store is borrowed, not shared: `GameEngine.update()` no-ops unless
   * `status === 'PLAYING'`, and `loadMap` reads the player's modifiers. A
   * playtest must judge the chart as authored, so the modifiers are pinned to the
   * defaults for the duration and everything is restored in {@link stop} —
   * otherwise opening the editor would quietly rewrite the player's mod
   * selection.
   */
  static async start(input: PlaytestStartInput): Promise<PlaytestSession> {
    active?.stop();

    const store = useSliceItStore.getState();
    const snapshot: StoreSnapshot = {
      status: store.status,
      isPaused: store.isPaused,
      songId: store.songId,
      modifiers: store.modifiers,
    };

    const map = buildPlaytestMap(input.song, input.notes);
    const session = new PlaytestSession(map, snapshot, input.from);
    session.loop = input.loop ?? null;
    active = session;

    store.setModifiers({ ...DEFAULT_MODIFIERS });
    store.setStatus('PLAYING');
    store.setIsPaused(false);

    try {
      session.buffer = await session.audio.loadTrack(map.audioUrl);
    } catch {
      // No audio (offline, or a song whose file has gone): the run still judges
      // against the audio clock, which simply never advances. Better than
      // throwing out of a button press.
      session.buffer = null;
    }
    if (session.stopped) return session;

    await session.#engine.loadMap(map, session.buffer ?? undefined);
    session.play(input.from);
    return session;
  }

  private play(from: number): void {
    seekAudio(this.audio, from);
    this.startedFrom = from;
    this.lastTime = from;
    this.#engine.start();
  }

  /**
   * One frame. Returns the transport position the editor should scroll to.
   *
   * The session is driven by the editor's rAF loop rather than owning one:
   * the timeline is already repainting, and a second loop would judge and draw at
   * different moments.
   */
  tick(): number {
    if (this.stopped) return this.lastTime;
    this.#engine.update();
    const time = this.audio.getCurrentTime();
    this.lastTime = time;
    this.collectHits();

    if (this.loop && !this.wrapping && time >= this.loop.end) {
      this.wrapping = true;
      void this.rewind(this.loop.start);
    }
    return time;
  }

  /**
   * Restart the chart at `at`.
   *
   * A full `loadMap` rather than a rewind of the clock: the engine's note cursor,
   * its resolved-id set and its judgement counters only move forward, so an A/B
   * loop that only moved the audio would play the second lap with every note
   * already spent.
   */
  private async rewind(at: number): Promise<void> {
    try {
      await this.#engine.loadMap(this.map, this.buffer ?? undefined);
      if (this.stopped) return;
      this.hits.clear();
      this.scanCursor = 0;
      useSliceItStore.getState().setStatus('PLAYING');
      useSliceItStore.getState().setIsPaused(false);
      this.play(at);
    } finally {
      this.wrapping = false;
    }
  }

  /** Forward a key press to the judge. `at` is `event.timeStamp` (§10). */
  press(lane: number, at?: number): void {
    if (!this.stopped) this.#engine.submitInput(lane, at);
  }

  release(lane: number): void {
    if (!this.stopped) this.#engine.submitRelease(lane);
  }

  /** Judgement text the HUD prints, drained so it is shown once. */
  drainFeedback(): Feedback[] {
    const queue = this.#engine.feedbackQueue;
    if (queue.length === 0) return [];
    return queue.splice(0, queue.length);
  }

  /**
   * Hit highlights, keyed by note id (§4.4a).
   *
   * Read off the slices the engine resolved — `hit` and `hitTime` are already
   * there, written by `resolve()` and by the miss sweep — rather than mirrored
   * through a second channel that could disagree with what was scored.
   */
  private collectHits(): void {
    const slices = this.#engine.getSlices();
    for (let i = this.scanCursor; i < slices.length; i++) {
      const slice: Slice = slices[i];
      if (slice.hitTime === undefined) {
        // Notes resolve in time order, so the first unresolved note is where the
        // next scan starts — the alternative is walking a 1200-note chart every
        // frame to find the two that changed.
        this.scanCursor = i;
        return;
      }
      this.hits.set(slice.id, { hit: slice.hit === true, at: slice.hitTime });
    }
    this.scanCursor = slices.length;
  }

  hitOf(noteId: string): HitMark | undefined {
    return this.hits.get(noteId);
  }

  get time(): number {
    return this.lastTime;
  }

  get from(): number {
    return this.startedFrom;
  }

  get looping(): boolean {
    return this.loop !== null;
  }

  get mapId(): string {
    return this.map.id;
  }

  get running(): boolean {
    return !this.stopped;
  }

  /**
   * Stop, and return where the audio stopped.
   *
   * §10: "Stopping a playtest puts the playhead where the audio stopped, not back
   * where it started." The caller writes the returned position to the editor's
   * playhead, and the author is looking at the bar they just heard.
   */
  stop(): number {
    if (this.stopped) return this.lastTime;
    this.stopped = true;
    const at = this.audio.getCurrentTime() || this.lastTime;
    this.lastTime = at;
    this.audio.stop();

    const store = useSliceItStore.getState();
    store.setModifiers(this.snapshot.modifiers);
    store.setStatus(this.snapshot.status);
    store.setIsPaused(this.snapshot.isPaused);
    if (this.snapshot.songId) store.setSongId(this.snapshot.songId);

    if (active === this) active = null;
    return at;
  }

  /**
   * The closed door.
   *
   * `useSubmitScore` wants a `RunSummary`. This is the only method on the session
   * that names one, and it throws — so "submit the playtest" is not a thing a
   * caller can express, even by accident, even in a refactor that forgets why.
   */
  runSummary(): never {
    throw new PlaytestForbiddenError(
      `Refusing to summarise a playtest run (${this.map.id}). Editor runs are never scored.`,
    );
  }
}

/* ─── The editor's transport ─────────────────────────────────────────────── */

/**
 * What Ctrl+Space loops.
 *
 * The selection if there is one — an author iterating on a pattern has it
 * selected — then the editor's own A/B markers. A loop with neither is not a
 * loop, so `null` falls back to plain playback rather than guessing a range.
 */
export function selectionRange(): { start: number; end: number } | null {
  const state = editorState();
  const selected = state.charts[state.active].notes.filter((note) => note.selected);
  if (selected.length >= 2) {
    const start = selected[0].time;
    const end = selected[selected.length - 1].time;
    // A tail of one beat, so the last note of the pattern is heard resolving
    // rather than cut off by the wrap.
    const tail = 60 / (state.song?.bpm || 120);
    if (end > start) return { start: Math.max(0, start - 0.1), end: end + tail };
  }
  return state.loop;
}

/**
 * Play the working chart from the playhead (§10).
 *
 * **Never from the start**: an author fixing a bar at 2:40 must not sit through
 * 2:40 of song. `Space` plays from where they are looking; `Ctrl+Space` loops
 * what they have selected.
 */
export async function startEditorPlaytest(options: { loop?: boolean } = {}): Promise<void> {
  const state = editorState();
  if (!state.song || state.playtesting) return;

  const loop = options.loop ? selectionRange() : null;
  const from = loop ? loop.start : state.playhead;
  state.setPlaytesting(true);
  try {
    await PlaytestSession.start({
      song: state.song,
      notes: state.charts[state.active].notes,
      from,
      loop,
    });
  } catch {
    state.setPlaytesting(false);
    activePlaytest()?.stop();
  }
}

/**
 * Stop, and leave the playhead where the audio stopped (§10).
 *
 * Returning to where playback *started* is the behaviour every editor gets wrong
 * once: the author pressed play to hear a bar, and the thing they want to fix is
 * the bar they just heard.
 */
export function stopEditorPlaytest(): number {
  const state = editorState();
  const session = activePlaytest();
  const at = session ? session.stop() : state.playhead;
  state.setPlaytesting(false);
  state.setPlayhead(at);
  return at;
}
