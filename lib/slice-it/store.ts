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

interface SliceItState {
  /* ── Settings (persisted) ─────────────────────────────────────────── */
  userName: string;
  keybinds: Keybinds;
  volume: number;
  sfxVolume: number;
  hitSound: string;
  /** Milliseconds. Positive means the audio runs ahead of the visuals. */
  audioOffset: number;
  isDarkMode: boolean;
  modifiers: Modifiers;

  /* ── Run state ────────────────────────────────────────────────────── */
  status: GameStatus;
  songId: string;
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
  setVolume: (volume: number) => void;
  setSfxVolume: (volume: number) => void;
  setHitSound: (hitSound: string) => void;
  setAudioOffset: (offset: number) => void;
  setIsDarkMode: (isDark: boolean) => void;
  setModifiers: (modifiers: Modifiers) => void;

  setStatus: (status: GameStatus) => void;
  setSongId: (songId: string) => void;
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
      volume: 100,
      sfxVolume: 80,
      hitSound: 'default',
      audioOffset: 0,
      isDarkMode: true,
      modifiers: { ...DEFAULT_MODIFIERS },

      ...runDefaults,
      ...multiplayerDefaults,
      connection: 'idle' as RealtimeStatus,

      setUserName: (userName) => set({ userName }),
      setKeybinds: (keybinds) => set({ keybinds }),
      setVolume: (volume) => set({ volume: clampPercent(volume) }),
      setSfxVolume: (sfxVolume) => set({ sfxVolume: clampPercent(sfxVolume) }),
      setHitSound: (hitSound) => set({ hitSound }),
      setAudioOffset: (audioOffset) =>
        set({ audioOffset: Math.max(-500, Math.min(500, Math.round(audioOffset))) }),
      setIsDarkMode: (isDarkMode) => set({ isDarkMode }),
      setModifiers: (modifiers) => set({ modifiers: applyExclusions(modifiers) }),

      setStatus: (status) => set({ status }),
      setSongId: (songId) => set({ songId }),
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
      pushChat: (message) =>
        set((state) => ({ chat: [...state.chat, message].slice(-CHAT_KEEP) })),
      setPublicLobbies: (publicLobbies) => set({ publicLobbies }),
      setLobbyError: (lobbyError) => set({ lobbyError }),
      setPause: (pause) => set({ pause }),

      resetRun: () => set({ ...runDefaults }),
      resetMultiplayer: () => set({ ...runDefaults, ...multiplayerDefaults }),
    }),
    {
      name: 'slice-it-storage',
      version: 2,
      // Settings only. Run and lobby state are per-session by definition, and
      // persisting a lobby snapshot would restore a room that no longer exists.
      partialize: (state) => ({
        userName: state.userName,
        keybinds: state.keybinds,
        volume: state.volume,
        sfxVolume: state.sfxVolume,
        hitSound: state.hitSound,
        audioOffset: state.audioOffset,
        isDarkMode: state.isDarkMode,
        modifiers: state.modifiers,
      }),
      /**
       * v1 stored the same settings minus `modifiers`, which lived in
       * un-persisted run state. Carrying the old keys forward and filling in
       * the new one keeps every existing player's keybinds and calibration
       * offset — the two settings nobody wants to re-enter.
       */
      migrate: (persisted, version) => {
        const state = (persisted ?? {}) as Record<string, unknown>;
        if (version < 2) {
          return { ...state, modifiers: { ...DEFAULT_MODIFIERS } };
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

/** Non-reactive read, for the engine and other imperative callers. */
export const sliceItState = () => useSliceItStore.getState();
