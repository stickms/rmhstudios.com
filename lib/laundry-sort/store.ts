/**
 * Laundry Sort — UI store.
 *
 * Screens, lobby state and end-of-match results only. Per-frame values (score,
 * combo, clock) are **not** here: they change 60 times a second and pushing
 * them through React would re-render the tree every frame for no benefit. The
 * HUD subscribes to the running match directly through a ref (see
 * `components/laundry-sort/hud/HudReadout.tsx`) and updates its own text nodes.
 */

import { create } from 'zustand';
import {
  DEFAULT_DIFFICULTY,
  DEFAULT_DURATION,
  type Difficulty,
  type MatchDuration,
} from './constants';
import type { RealtimeStatus } from '@/lib/shared/realtime/types';
import type {
  LobbySnapshot,
  LiveScore,
  MatchResults,
  MatchStartPayload,
  PublicLobbyInfo,
} from './net/events';
import type { MatchStats } from './match';

export type Screen = 'menu' | 'lobby' | 'browse' | 'playing' | 'results';
export type Mode = 'solo' | 'versus';

export interface SoloResult {
  stats: MatchStats;
  durationSec: number;
  difficulty: Difficulty;
  /** Filled in once the score POST resolves. */
  submitted: 'idle' | 'pending' | 'done' | 'error';
  personalBest: boolean;
}

interface LaundryStore {
  screen: Screen;
  mode: Mode;

  /** Solo setup, also the values a host proposes when creating a lobby. */
  durationSec: MatchDuration;
  difficulty: Difficulty;

  connection: RealtimeStatus;
  lobby: LobbySnapshot | null;
  publicLobbies: PublicLobbyInfo[];
  browsing: boolean;
  /** Our own socket id inside the lobby, so the roster can mark "you". */
  selfSocketId: string | null;

  countdown: number | null;
  start: MatchStartPayload | null;
  liveScores: LiveScore[];
  results: MatchResults | null;
  soloResult: SoloResult | null;

  /** Last recoverable server message, surfaced inline rather than as a toast. */
  error: string | null;

  setScreen: (screen: Screen) => void;
  setMode: (mode: Mode) => void;
  setDuration: (durationSec: MatchDuration) => void;
  setDifficulty: (difficulty: Difficulty) => void;
  setConnection: (connection: RealtimeStatus) => void;
  setLobby: (lobby: LobbySnapshot | null) => void;
  setPublicLobbies: (lobbies: PublicLobbyInfo[]) => void;
  setBrowsing: (browsing: boolean) => void;
  setSelfSocketId: (id: string | null) => void;
  setCountdown: (seconds: number | null) => void;
  setStart: (payload: MatchStartPayload | null) => void;
  setLiveScores: (scores: LiveScore[]) => void;
  setResults: (results: MatchResults | null) => void;
  setSoloResult: (result: SoloResult | null) => void;
  patchSoloResult: (patch: Partial<SoloResult>) => void;
  setError: (message: string | null) => void;
  /** Back to the menu, keeping connection + setup preferences. */
  leaveMatch: () => void;
  reset: () => void;
}

const INITIAL = {
  screen: 'menu' as Screen,
  mode: 'solo' as Mode,
  durationSec: DEFAULT_DURATION,
  difficulty: DEFAULT_DIFFICULTY,
  connection: 'idle' as RealtimeStatus,
  lobby: null,
  publicLobbies: [],
  browsing: false,
  selfSocketId: null,
  countdown: null,
  start: null,
  liveScores: [],
  results: null,
  soloResult: null,
  error: null,
};

export const useLaundryStore = create<LaundryStore>((set) => ({
  ...INITIAL,

  setScreen: (screen) => set({ screen }),
  setMode: (mode) => set({ mode }),
  setDuration: (durationSec) => set({ durationSec }),
  setDifficulty: (difficulty) => set({ difficulty }),
  setConnection: (connection) => set({ connection }),
  setLobby: (lobby) => set({ lobby }),
  setPublicLobbies: (publicLobbies) => set({ publicLobbies, browsing: false }),
  setBrowsing: (browsing) => set({ browsing }),
  setSelfSocketId: (selfSocketId) => set({ selfSocketId }),
  setCountdown: (countdown) => set({ countdown }),
  setStart: (start) => set({ start }),
  setLiveScores: (liveScores) => set({ liveScores }),
  setResults: (results) => set({ results }),
  setSoloResult: (soloResult) => set({ soloResult }),
  patchSoloResult: (patch) =>
    set((state) => (state.soloResult ? { soloResult: { ...state.soloResult, ...patch } } : {})),
  setError: (error) => set({ error }),

  leaveMatch: () =>
    set({
      screen: 'menu',
      lobby: null,
      countdown: null,
      start: null,
      liveScores: [],
      results: null,
      soloResult: null,
      error: null,
    }),

  reset: () => set({ ...INITIAL }),
}));
