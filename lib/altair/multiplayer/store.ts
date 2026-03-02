// =============================================================================
// ALTAIR MULTIPLAYER -- Client Zustand Store
// =============================================================================
// Manages multiplayer state: lobby, class selections, game snapshots,
// communication. Following /lib/rmhbox/store.ts pattern.
// =============================================================================

'use client';

import { create } from 'zustand';
import type {
  AltairClientLobbyState,
  AltairClientPlayer,
  GameStateSnapshot,
  GameEvent,
  PingData,
  QuickChatData,
  GameResultsData,
} from './types';

export interface AltairMultiplayerStore {
  connectionStatus: 'disconnected' | 'connecting' | 'connected' | 'error';
  lobby: AltairClientLobbyState | null;
  localPlayerId: string | null;
  isHost: boolean;

  // Class selection phase
  classSelections: Record<string, string | null>; // userId → classId
  readyStates: Record<string, boolean>; // userId → ready

  // Game phase
  countdown: number | null;
  gameStarted: boolean;
  gameSnapshot: GameStateSnapshot | null;
  gameEvents: GameEvent[];
  results: GameResultsData | null;

  // Communication
  pings: PingData[];
  quickChats: QuickChatData[];

  // Actions
  setConnectionStatus: (status: AltairMultiplayerStore['connectionStatus']) => void;
  applyFullSync: (state: AltairClientLobbyState) => void;
  leaveLobby: () => void;
  setClassSelections: (selections: Record<string, string | null>, readyStates: Record<string, boolean>) => void;
  setCountdown: (seconds: number) => void;
  setGameStarted: (tick: number) => void;
  setGameSnapshot: (snapshot: GameStateSnapshot) => void;
  addGameEvent: (event: GameEvent) => void;
  playerJoined: (player: AltairClientPlayer) => void;
  playerLeft: (userId: string) => void;
  setResults: (results: GameResultsData) => void;
  addPing: (ping: PingData) => void;
  addQuickChat: (chat: QuickChatData) => void;
  reset: () => void;
}

const INITIAL_STATE = {
  connectionStatus: 'disconnected' as const,
  lobby: null,
  localPlayerId: null,
  isHost: false,
  classSelections: {},
  readyStates: {},
  countdown: null,
  gameStarted: false,
  gameSnapshot: null,
  gameEvents: [],
  results: null,
  pings: [],
  quickChats: [],
};

export const useAltairMultiplayerStore = create<AltairMultiplayerStore>((set, get) => ({
  ...INITIAL_STATE,

  setConnectionStatus: (connectionStatus) => set({ connectionStatus }),

  applyFullSync: (state) => {
    set({
      lobby: state,
      localPlayerId: state.myUserId,
      isHost: state.hostUserId === state.myUserId,
    });
  },

  leaveLobby: () => {
    set({
      lobby: null,
      isHost: false,
      classSelections: {},
      readyStates: {},
      countdown: null,
      gameStarted: false,
      gameSnapshot: null,
      gameEvents: [],
      results: null,
      pings: [],
      quickChats: [],
    });
  },

  setClassSelections: (selections, readyStates) => {
    set({ classSelections: selections, readyStates });
  },

  setCountdown: (seconds) => set({ countdown: seconds }),

  setGameStarted: (_tick) => {
    set({
      gameStarted: true,
      countdown: null,
      gameEvents: [],
      results: null,
    });
  },

  setGameSnapshot: (snapshot) => set({ gameSnapshot: snapshot }),

  addGameEvent: (event) => {
    set((s) => ({
      gameEvents: [...s.gameEvents.slice(-19), event], // Keep last 20
    }));
  },

  playerJoined: (player) => {
    const lobby = get().lobby;
    if (!lobby) return;
    set({
      lobby: {
        ...lobby,
        players: [...lobby.players.filter((p) => p.userId !== player.userId), player],
      },
    });
  },

  playerLeft: (userId) => {
    const lobby = get().lobby;
    if (!lobby) return;
    set({
      lobby: {
        ...lobby,
        players: lobby.players.filter((p) => p.userId !== userId),
      },
    });
  },

  setResults: (results) => set({ results, gameStarted: false }),

  addPing: (ping) => {
    set((s) => ({
      pings: [...s.pings.slice(-9), ping], // Keep last 10
    }));
  },

  addQuickChat: (chat) => {
    set((s) => ({
      quickChats: [...s.quickChats.slice(-9), chat],
    }));
  },

  reset: () => set(INITIAL_STATE),
}));
