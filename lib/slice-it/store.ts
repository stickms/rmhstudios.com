/**
 * Slice It — client state.
 *
 * One store, three concerns kept deliberately separate inside it:
 *
 *  - **Settings** (`persist`ed): keybinds, volumes, hit sound, audio offset,
 *    theme. These outlive a session and are the only thing written to disk.
 *  - **Run state**: score, combo, accuracy, status. Reset between runs.
 *  - **Multiplayer**: the lobby snapshot the server sent, live opponent scores,
 *    connection status. The server owns all of it; nothing here is authoritative.
 *
 * The multiplayer half used to be a `Record<socketId, …>` of opponents mutated
 * from inside the socket factory, with the lobby shape re-derived on each side
 * of the wire. It is now a straight copy of the server's snapshot, because the
 * server is the only thing that knows who is in a lobby.
 */

'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { RealtimeStatus } from '@/lib/shared/realtime/types';
import { DEFAULT_MODIFIERS, applyExclusions } from './modifiers';
import type { Modifiers } from './types';
import type { TimingSummary } from './integrity';
import {
  BASE_APPROACH_SEC,
  MAX_LANE_COVER,
  MAX_SCROLL_SPEED,
  MIN_LANE_COVER,
  MIN_SCROLL_SPEED,
  DEFAULT_LINE_POSITION,
  clampLinePosition,
  type ScrollMode,
  type VisibilityMode,
} from './constants';
import type {
  ChatMessage,
  LiveScore,
  LobbySnapshot,
  MatchResults,
  PausePayload,
} from './net/events';

export interface Keybinds {
  lane1: string;
  lane2: string;
}

export type GameStatus = 'MENU' | 'PLAYING' | 'FINISHED';

/**
 * One finished run's hit timing, kept for the calibration advisor.
 *
 * Persisted **locally**, alongside the settings, rather than sent to the server
 * — and that is the correct home for it rather than a convenience. Audio
 * latency is a property of this machine: its output device, its buffer size,
 * whether the player is on bluetooth headphones today. An account-level history
 * pooled across a desktop and a phone would average two different latencies
 * into one number that is wrong for both.
 */
export interface TimingSample {
  songTitle: string;
  durationSec: number;
  /** 0–1. */
  accuracy: number;
  timing: TimingSummary;
  /** Epoch ms, so the newest runs can be preferred. */
  at: number;
}

/**
 * How many samples to keep. Enough that the pooled statistic means something,
 * few enough that a change of headphones works its way out within an evening.
 */
const TIMING_SAMPLES_KEPT = 8;

interface SliceItState {
  /* ── Settings (persisted) ─────────────────────────────────────────── */
  userName: string;
  keybinds: Keybinds;
  /**
   * I1 — additional keys bound to each lane, indexed by lane.
   *
   * Additive rather than reshaping `keybinds` into arrays: that object is in
   * every existing player's local storage and read by four call sites, and a
   * migration that goes wrong silently drops someone's bindings. See
   * `lib/slice-it/input.ts`.
   */
  extraBinds: string[][];
  volume: number;
  sfxVolume: number;
  hitSound: string;
  /** Milliseconds. Positive means the audio runs ahead of the visuals. */
  audioOffset: number;
  /**
   * I5 — the input pipeline's own delay, ms, measured WITHOUT audio.
   *
   * A separate number from `audioOffset` because they are separate faults:
   * one is how late the sound is, the other is how late the keypress is. Folded
   * into a single offset they cancel and mask each other, which is why
   * "calibrating did not help" is such a common complaint in this genre.
   */
  inputOffset: number;
  isDarkMode: boolean;
  /**
   * Colour notes by the beat subdivision they snapped to (`Slice.quant`) rather
   * than by lane. On by default, because it is the genre standard and the lane a
   * note is in is already legible from its position — but a setting, because it
   * is a real change to what the playfield looks like.
   */
  quantColors: boolean;
  /** A3 — lane palette id. See `lib/slice-it/palettes.ts`. */
  lanePalette: string;
  /**
   * A2 — cap how much the screen may brighten per frame, and drop the
   * decorative flashes entirely.
   *
   * Separate from `canvasGlowEnabled()`, which degrades blur for PERFORMANCE:
   * a fast machine still gets the full flash. This is the photosensitivity
   * axis, and the game declares `descriptors: ['flashing']` with nothing to
   * turn it off until now.
   */
  reducedFlash: boolean;
  /** A7 — per-effect intensity, 0..1. Scales shake, rotation and particles. */
  effectIntensity: number;
  /**
   * H9 — the WORST judgement that still gets a popup, by rank.
   *
   * `JUDGEMENT_ORDER` runs best-to-worst, so `'MARVELOUS'` (rank 0) is the
   * permissive floor and shows everything — the default, because that is
   * today's behaviour. Setting it to `'GREAT'` hides MARVELOUS and PERFECT,
   * which is the common expert configuration: on a good run those two fire
   * constantly and carry no information, while obscuring the notes behind them.
   */
  showJudgementsBelow: string;
  /** H9 — popup scale and opacity, and where the combo counter sits. */
  judgementScale: number;
  judgementOpacity: number;
  comboPosition: 'center' | 'left' | 'right' | 'hidden';
  /** P4 — a click on every beat. A learning tool, not a challenge setting. */
  metronome: boolean;
  /** P4 — a click on every NOTE, whether or not you hit it. */
  assistTick: boolean;
  modifiers: Modifiers;
  /** Recent runs' hit timing, newest last. See {@link TimingSample}. */
  recentTiming: TimingSample[];
  /**
   * M7 — named modifier presets.
   *
   * Persisted with the settings, because the whole point is not re-toggling
   * nine switches every session to get back to "my practice setup".
   */
  modifierPresets: { id: string; name: string; modifiers: Modifiers }[];
  /**
   * M1 — Mirror. Swaps lanes for every run until turned off again.
   *
   * A player preference rather than a per-run `Modifiers` field on purpose:
   * it earns no score bonus (see `chart.ts` `applyMirror`), so it does not
   * belong in the schema the server verifies a submission's multiplier
   * against — there is nothing there to verify.
   */
  mirror: boolean;
  /** G9 — scroll speed. 1.0 reproduces today's fixed approach distance. */
  scrollSpeed: number;
  /** G9 — `constant` (BPM-independent) or `bpm` (speed scales with tempo). */
  scrollMode: ScrollMode;
  /**
   * M3 — which visibility effect plays while the `invisible` modifier is on.
   * Orthogonal to `modifiers.invisible` itself — see `modifiers.ts`
   * `visibilityAlpha` for why it lives here instead of in `Modifiers`.
   */
  visibilityMode: VisibilityMode;
  /** V10 — the lane cover's height, as a fraction of the approach distance. */
  laneCoverHeight: number;
  /**
   * G11 — where the judgement line sits, as a fraction of the scroll axis
   * measured from the far edge. Cosmetic: G9 decides how LONG a note is
   * visible, this decides where on screen that time is spent.
   */
  linePosition: number;

  /* ── Run state ────────────────────────────────────────────────────── */
  status: GameStatus;
  songId: string;
  /**
   * The current run's signed receipt, from the song read. Handed back with the
   * score so the server can tell how long the run took by its own clock.
   */
  runToken: string | null;
  /**
   * C2 — which chart of the selected song is about to be played, or `null` for
   * the generated fallback.
   *
   * Transient (not persisted) on purpose: it is a property of the song you are
   * looking at right now, and restoring a chart id from local storage after the
   * chart was deleted, unpublished or re-authored is a run that fails at load
   * for a reason the player cannot see.
   */
  selectedChartId: string | null;
  score: number;
  combo: number;
  maxCombo: number;
  accuracy: number;
  /** The speed the run is being played at — shown on the results card. */
  multiplier: number;
  isPaused: boolean;

  /* ── Loading / sync ───────────────────────────────────────────────── */
  isLoadingSong: boolean;
  loadingProgress: number;
  loadingProgressText: string;
  countdown: number;

  /* ── Multiplayer ──────────────────────────────────────────────────── */
  isMultiplayer: boolean;
  connection: RealtimeStatus;
  /** This tab's socket id, as the server sees it. */
  selfSocketId: string | null;
  lobby: LobbySnapshot | null;
  /** Live scores by socket id, including our own echo. */
  liveScores: Record<string, LiveScore>;
  /** Per-player chart-load progress during the pre-match wait. */
  loadingPlayers: { socketId: string; name: string; loaded: boolean }[];
  matchResults: MatchResults | null;
  chat: ChatMessage[];
  publicLobbies: PublicLobbyRow[];
  lobbyError: string | null;
  /**
   * Set while the match is held for a player who dropped. Null the rest of the
   * time — the presence of this object *is* the pause, so no separate flag can
   * fall out of sync with it.
   */
  pause: PausePayload | null;

  /* ── Actions ──────────────────────────────────────────────────────── */
  setUserName: (name: string) => void;
  setKeybinds: (keybinds: Keybinds) => void;
  setExtraBinds: (binds: string[][]) => void;
  /** I5 — input-pipeline delay, ms. Separate from `audioOffset`. */
  setInputOffset: (ms: number) => void;
  setVolume: (volume: number) => void;
  setSfxVolume: (volume: number) => void;
  setHitSound: (hitSound: string) => void;
  setAudioOffset: (offset: number) => void;
  setIsDarkMode: (isDark: boolean) => void;
  setQuantColors: (value: boolean) => void;
  setLanePalette: (value: string) => void;
  setReducedFlash: (value: boolean) => void;
  setEffectIntensity: (value: number) => void;
  setShowJudgementsBelow: (value: string) => void;
  setJudgementScale: (value: number) => void;
  setJudgementOpacity: (value: number) => void;
  setComboPosition: (value: 'center' | 'left' | 'right' | 'hidden') => void;
  setMetronome: (value: boolean) => void;
  setAssistTick: (value: boolean) => void;
  setModifiers: (modifiers: Modifiers) => void;
  recordTiming: (sample: TimingSample) => void;
  saveModifierPreset: (name: string) => void;
  applyModifierPreset: (id: string) => void;
  deleteModifierPreset: (id: string) => void;
  setMirror: (value: boolean) => void;
  setScrollSpeed: (value: number) => void;
  setScrollMode: (mode: ScrollMode) => void;
  setVisibilityMode: (mode: VisibilityMode) => void;
  setLaneCoverHeight: (value: number) => void;
  setLinePosition: (value: number) => void;

  setStatus: (status: GameStatus) => void;
  setSongId: (songId: string) => void;
  setRunToken: (token: string | null) => void;
  setSelectedChartId: (chartId: string | null) => void;
  setScore: (score: number, combo: number, multiplier?: number) => void;
  setMaxCombo: (maxCombo: number) => void;
  setAccuracy: (accuracy: number) => void;
  setIsPaused: (isPaused: boolean) => void;

  setIsLoadingSong: (loading: boolean) => void;
  setLoadingProgress: (progress: number) => void;
  setLoadingProgressText: (text: string) => void;
  setCountdown: (count: number) => void;

  setIsMultiplayer: (value: boolean) => void;
  setConnection: (status: RealtimeStatus) => void;
  setSelfSocketId: (id: string | null) => void;
  setLobby: (lobby: LobbySnapshot | null) => void;
  setLiveScores: (scores: LiveScore[]) => void;
  setLoadingPlayers: (players: { socketId: string; name: string; loaded: boolean }[]) => void;
  setMatchResults: (results: MatchResults | null) => void;
  pushChat: (message: ChatMessage) => void;
  setPublicLobbies: (lobbies: PublicLobbyRow[]) => void;
  setLobbyError: (message: string | null) => void;
  setPause: (pause: PausePayload | null) => void;

  /** Clear the run, keep settings and the lobby. */
  resetRun: () => void;
  /** Clear the run *and* every multiplayer trace — leaving a lobby for good. */
  resetMultiplayer: () => void;
}

export interface PublicLobbyRow {
  code: string;
  hostName: string;
  playerCount: number;
  maxPlayers: number;
  songTitle: string | null;
}

const CHAT_KEEP = 50;

const runDefaults = {
  status: 'MENU' as GameStatus,
  songId: '',
  runToken: null,
  selectedChartId: null,
  score: 0,
  combo: 0,
  maxCombo: 0,
  accuracy: 0,
  multiplier: 1,
  isPaused: false,
  isLoadingSong: false,
  loadingProgress: 0,
  loadingProgressText: '',
  countdown: 0,
};

const multiplayerDefaults = {
  isMultiplayer: false,
  selfSocketId: null,
  lobby: null,
  liveScores: {},
  loadingPlayers: [],
  matchResults: null,
  chat: [],
  publicLobbies: [],
  lobbyError: null,
  pause: null,
};

export const useSliceItStore = create<SliceItState>()(
  persist(
    (set) => ({
      userName: '',
      keybinds: { lane1: 'ArrowLeft', lane2: 'ArrowRight' },
      extraBinds: [[], []],
      inputOffset: 0,
      volume: 100,
      sfxVolume: 80,
      hitSound: 'default',
      audioOffset: 0,
      isDarkMode: true,
      quantColors: true,
      lanePalette: 'default',
      reducedFlash: false,
      effectIntensity: 1,
      showJudgementsBelow: 'MARVELOUS',
      judgementScale: 1,
      judgementOpacity: 1,
      comboPosition: 'center' as const,
      metronome: false,
      assistTick: false,
      modifiers: { ...DEFAULT_MODIFIERS },
      recentTiming: [],
      modifierPresets: [],
      mirror: false,
      scrollSpeed: 1.0,
      scrollMode: 'constant',
      visibilityMode: 'fadeOut',
      laneCoverHeight: 0.3,
      linePosition: DEFAULT_LINE_POSITION,

      ...runDefaults,
      ...multiplayerDefaults,
      connection: 'idle' as RealtimeStatus,

      setUserName: (userName) => set({ userName }),
      setKeybinds: (keybinds) => set({ keybinds }),
      setExtraBinds: (extraBinds) => set({ extraBinds }),
      setInputOffset: (inputOffset) =>
        set({ inputOffset: Math.max(-200, Math.min(200, Math.round(inputOffset))) }),
      setVolume: (volume) => set({ volume: clampPercent(volume) }),
      setSfxVolume: (sfxVolume) => set({ sfxVolume: clampPercent(sfxVolume) }),
      setHitSound: (hitSound) => set({ hitSound }),
      setAudioOffset: (audioOffset) =>
        set({ audioOffset: Math.max(-500, Math.min(500, Math.round(audioOffset))) }),
      setIsDarkMode: (isDarkMode) => set({ isDarkMode }),
      setQuantColors: (quantColors) => set({ quantColors }),
      setLanePalette: (lanePalette) => set({ lanePalette }),
      setReducedFlash: (reducedFlash) => set({ reducedFlash }),
      setEffectIntensity: (v) => set({ effectIntensity: Math.max(0, Math.min(1, v)) }),
      setShowJudgementsBelow: (showJudgementsBelow) => set({ showJudgementsBelow }),
      setJudgementScale: (v) => set({ judgementScale: Math.max(0.5, Math.min(1.5, v)) }),
      setJudgementOpacity: (v) => set({ judgementOpacity: Math.max(0.2, Math.min(1, v)) }),
      setComboPosition: (comboPosition) => set({ comboPosition }),
      setMetronome: (metronome) => set({ metronome }),
      setAssistTick: (assistTick) => set({ assistTick }),
      setModifiers: (modifiers) => set({ modifiers: applyExclusions(modifiers) }),
      recordTiming: (sample) =>
        set((state) => ({
          recentTiming: [...state.recentTiming, sample].slice(-TIMING_SAMPLES_KEPT),
        })),
      saveModifierPreset: (name) =>
        set((state) => {
          const trimmed = name.trim().slice(0, 40);
          if (!trimmed) return {};
          // Saving over an existing name REPLACES it rather than making a
          // second entry with the same label — a preset list with two
          // "Practice"s is a list you cannot use.
          const rest = state.modifierPresets.filter((preset) => preset.name !== trimmed);
          return {
            modifierPresets: [
              ...rest,
              { id: `${Date.now().toString(36)}`, name: trimmed, modifiers: state.modifiers },
            ].slice(-12),
          };
        }),
      applyModifierPreset: (id) =>
        set((state) => {
          const preset = state.modifierPresets.find((entry) => entry.id === id);
          if (!preset) return {};
          // Re-normalised on the way out: a preset saved before a modifier
          // existed is missing that key, and a preset saved before an exclusion
          // rule existed may hold a pair that is now contradictory.
          return { modifiers: applyExclusions({ ...DEFAULT_MODIFIERS, ...preset.modifiers }) };
        }),
      deleteModifierPreset: (id) =>
        set((state) => ({
          modifierPresets: state.modifierPresets.filter((preset) => preset.id !== id),
        })),
      setMirror: (mirror) => set({ mirror }),
      setScrollSpeed: (scrollSpeed) => set({ scrollSpeed: clampScrollSpeed(scrollSpeed) }),
      setScrollMode: (scrollMode) => set({ scrollMode }),
      setVisibilityMode: (visibilityMode) => set({ visibilityMode }),
      setLaneCoverHeight: (laneCoverHeight) =>
        set({ laneCoverHeight: clampLaneCover(laneCoverHeight) }),
      setLinePosition: (linePosition) => set({ linePosition: clampLinePosition(linePosition) }),

      setStatus: (status) => set({ status }),
      setSongId: (songId) => set({ songId }),
      setRunToken: (runToken) => set({ runToken }),
      setSelectedChartId: (selectedChartId) => set({ selectedChartId }),
      setScore: (score, combo, multiplier) =>
        set((state) => ({ score, combo, multiplier: multiplier ?? state.multiplier })),
      setMaxCombo: (maxCombo) => set({ maxCombo }),
      setAccuracy: (accuracy) => set({ accuracy }),
      setIsPaused: (isPaused) => set({ isPaused }),

      setIsLoadingSong: (isLoadingSong) => set({ isLoadingSong }),
      setLoadingProgress: (loadingProgress) => set({ loadingProgress }),
      setLoadingProgressText: (loadingProgressText) => set({ loadingProgressText }),
      setCountdown: (countdown) => set({ countdown }),

      setIsMultiplayer: (isMultiplayer) => set({ isMultiplayer }),
      setConnection: (connection) => set({ connection }),
      setSelfSocketId: (selfSocketId) => set({ selfSocketId }),
      setLobby: (lobby) => set({ lobby }),
      setLiveScores: (scores) =>
        set(() => {
          // Replaced wholesale rather than merged: the server sends the full
          // roster every tick, so a player who left must disappear rather than
          // linger at their last score.
          const next: Record<string, LiveScore> = {};
          for (const score of scores) next[score.socketId] = score;
          return { liveScores: next };
        }),
      setLoadingPlayers: (loadingPlayers) => set({ loadingPlayers }),
      setMatchResults: (matchResults) => set({ matchResults }),
      pushChat: (message) => set((state) => ({ chat: [...state.chat, message].slice(-CHAT_KEEP) })),
      setPublicLobbies: (publicLobbies) => set({ publicLobbies }),
      setLobbyError: (lobbyError) => set({ lobbyError }),
      setPause: (pause) => set({ pause }),

      resetRun: () => set({ ...runDefaults }),
      resetMultiplayer: () => set({ ...runDefaults, ...multiplayerDefaults }),
    }),
    {
      name: 'slice-it-storage',
      version: 7,
      // Settings only. Run and lobby state are per-session by definition, and
      // persisting a lobby snapshot would restore a room that no longer exists.
      partialize: (state) => ({
        userName: state.userName,
        keybinds: state.keybinds,
        extraBinds: state.extraBinds,
        inputOffset: state.inputOffset,
        volume: state.volume,
        sfxVolume: state.sfxVolume,
        hitSound: state.hitSound,
        audioOffset: state.audioOffset,
        isDarkMode: state.isDarkMode,
        quantColors: state.quantColors,
        lanePalette: state.lanePalette,
        reducedFlash: state.reducedFlash,
        effectIntensity: state.effectIntensity,
        showJudgementsBelow: state.showJudgementsBelow,
        judgementScale: state.judgementScale,
        judgementOpacity: state.judgementOpacity,
        comboPosition: state.comboPosition,
        metronome: state.metronome,
        assistTick: state.assistTick,
        modifiers: state.modifiers,
        recentTiming: state.recentTiming,
        modifierPresets: state.modifierPresets,
        mirror: state.mirror,
        scrollSpeed: state.scrollSpeed,
        scrollMode: state.scrollMode,
        visibilityMode: state.visibilityMode,
        laneCoverHeight: state.laneCoverHeight,
        linePosition: state.linePosition,
      }),
      /**
       * Every migration here has the same job: carry the old keys forward
       * untouched and fill in only what is new. Keybinds and the calibration
       * offset are the two settings nobody wants to re-enter, and they have been
       * in this blob since v1.
       *
       * - **v1 → v2** stored the same settings minus `modifiers`, which lived in
       *   un-persisted run state.
       * - **v2 → v3** added `healthGauge` to `modifiers` and `quantColors`
       *   alongside it. `modifiers` is persisted as a whole object and zustand
       *   replaces it wholesale on rehydrate, so a v2 blob would restore a
       *   modifier set with `healthGauge: undefined` — falsy, and therefore
       *   harmless today, but a shape that does not match its own type. Merging
       *   over the defaults fills that and any field a future version adds.
       * - **v3 → v4** added five purely-visual settings (G9 scroll speed, M3
       *   the visibility family, V10 lane cover, M1 mirror) — all new
       *   top-level keys, so a v3 blob just needs them filled in.
       *   `visibilityMode: 'fadeOut'` is the load-bearing one: it makes
       *   `invisible` (unchanged, still a plain boolean in `Modifiers`)
       *   continue to render exactly as it always has for a player whose mod
       *   set already had `invisible: true` — the "alias" the split promises,
       *   done by leaving the old field alone rather than renaming it.
       * - **v6 → v7** added `recentTiming`, the local hit-timing history the
       *   calibration advisor pools. It starts empty rather than synthesised:
       *   the advisor refuses to answer below its sample threshold, which is
       *   the correct answer for a player with no measured runs yet.
       */
      migrate: (persisted, version) => {
        let state = (persisted ?? {}) as Record<string, unknown>;
        if (version < 2) {
          state = { ...state, modifiers: { ...DEFAULT_MODIFIERS } };
        }
        if (version < 3) {
          const stored = (state.modifiers ?? {}) as Partial<Modifiers>;
          state = {
            ...state,
            modifiers: { ...DEFAULT_MODIFIERS, ...stored },
            quantColors: true,
          };
        }
        if (version < 4) {
          state = {
            ...state,
            mirror: false,
            scrollSpeed: 1.0,
            scrollMode: 'constant',
            visibilityMode: 'fadeOut',
            laneCoverHeight: 0.3,
          };
        }
        if (version < 5) {
          // P4. Both default OFF: a guide sound nobody asked for, arriving on
          // top of the music the first time a returning player presses play, is
          // indistinguishable from a bug.
          state = { ...state, metronome: false, assistTick: false };
        }
        if (version < 6) {
          // A2/A3/A7/H9. Every default reproduces today's behaviour exactly, so
          // an existing player notices nothing until they go looking — an
          // accessibility release that changes how the game looks unprompted is
          // its own accessibility problem.
          state = {
            ...state,
            lanePalette: 'default',
            reducedFlash: false,
            effectIntensity: 1,
            showJudgementsBelow: 'MARVELOUS',
            judgementScale: 1,
            judgementOpacity: 1,
            comboPosition: 'center',
            modifierPresets: [],
            linePosition: DEFAULT_LINE_POSITION,
            extraBinds: [[], []],
            inputOffset: 0,
          };
        }
        if (version < 7) {
          state = { ...state, recentTiming: [] };
        }
        return state;
      },
    },
  ),
);

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 100;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function clampScrollSpeed(value: number): number {
  if (!Number.isFinite(value)) return 1.0;
  return Math.max(MIN_SCROLL_SPEED, Math.min(MAX_SCROLL_SPEED, Math.round(value * 10) / 10));
}

function clampLaneCover(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(MIN_LANE_COVER, Math.min(MAX_LANE_COVER, value));
}

/**
 * G9 — how many seconds ahead of the judgement line a note becomes visible.
 *
 * The one number players actually tune ("green number" in IIDX), so every
 * surface that shows a speed slider shows this next to it rather than the
 * bare multiplier. `constant` is BPM-independent (osu!mania scroll speed,
 * StepMania C-mod); `bpm` locks beat-spacing on screen instead, so a chart's
 * visual density stays put across a tempo change (StepMania X-mod).
 */
export function approachSeconds(bpm: number, scrollSpeed: number, mode: ScrollMode): number {
  const speed = scrollSpeed > 0 ? scrollSpeed : 1;
  const base = BASE_APPROACH_SEC / speed;
  if (mode !== 'bpm' || !(bpm > 0)) return base;
  return base * (120 / bpm);
}

/**
 * V10 — the lane cover's reaction window, in milliseconds.
 *
 * `approachSec` should already be the run's REAL (wall-clock) lead time —
 * `approachSeconds(...)` further divided by the playback-speed modifier, the
 * same `visibleWindow` `GameCanvas.tsx` computes for rendering — so the
 * number shown next to the slider is the one the player actually feels, not
 * an abstract fraction of an abstract distance.
 */
export function reactionWindowMs(approachSec: number, coverFraction: number): number {
  return Math.round(approachSec * (1 - coverFraction) * 1000);
}

/** Non-reactive read, for the engine and other imperative callers. */
export const sliceItState = () => useSliceItStore.getState();
