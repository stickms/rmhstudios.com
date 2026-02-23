/**
 * RMHbox — Client-Side Zustand Store
 *
 * Central state management for the RMHbox client.
 * Handles connection status, lobby state, game state,
 * and user settings with localStorage persistence.
 *
 * The store applies server-sent actions via reducer functions
 * that transform lobby and game state incrementally, with
 * sequence number ordering to prevent out-of-order updates.
 *
 * Reference: docs/rmhbox/design-spec/core.md §19
 * Implementation: docs/rmhbox/implementation/phase-4.md §4
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  ClientLobbyState,
  GameAction,
} from './types';

// ─── User Settings ───────────────────────────────────────────────

export interface RMHboxUserSettings {
  masterVolume: number;  // 0–1, default 0.7
  sfxVolume: number;     // 0–1, default 0.8
  musicVolume: number;   // 0–1, default 0.5
  showChat: boolean;     // default true
  chatPosition: 'left' | 'right'; // default 'right'
  theme: 'dark' | 'light'; // default 'dark'
}

const DEFAULT_SETTINGS: RMHboxUserSettings = {
  masterVolume: 0.7,
  sfxVolume: 0.8,
  musicVolume: 0.5,
  showChat: true,
  chatPosition: 'right',
  theme: 'dark',
};

// ─── Store Interface ─────────────────────────────────────────────

// ─── Timer & Round Info ──────────────────────────────────────────

/** Timer state managed by the header ring. Set via TIMER_START action or setTimerInfo(). */
export interface TimerInfo {
  /** Total duration in seconds (for full circle calculation) */
  total: number;
  /** Seconds remaining (decremented by TIMER_TICK) */
  remaining: number;
  /** Whether the timer is currently paused by the host */
  paused: boolean;
  /** Whether this is an infinite (no-countdown) timer — full ring + ∞ icon */
  infinite: boolean;
  /** Whether to show the host "Next" / force-skip button (only relevant for infinite timers) */
  showSkip: boolean;
}

/** Minigame sub-round info displayed in the GameShell footer. */
export interface MinigameRoundInfo {
  /** Current sub-round within the minigame (e.g. round 2 of 3 in Rhyme Time) */
  current: number;
  /** Total sub-rounds in this minigame */
  total: number;
}

export interface RMHboxStore {
  connectionStatus: 'disconnected' | 'connecting' | 'connected' | 'error';
  lobby: ClientLobbyState | null;
  gameState: Record<string, unknown>;
  lastSeq: number;
  settings: RMHboxUserSettings;

  /** Centralized timer state read by the header ring */
  timerInfo: TimerInfo | null;
  /** Minigame sub-round info read by the GameShell footer */
  minigameRound: MinigameRoundInfo | null;

  // Actions
  setConnectionStatus: (status: RMHboxStore['connectionStatus']) => void;
  applyAction: (action: GameAction) => void;
  applyFullSync: (fullState: ClientLobbyState) => void;
  setGameState: (state: Record<string, unknown>) => void;
  setTimerInfo: (info: TimerInfo | null) => void;
  setMinigameRound: (info: MinigameRoundInfo | null) => void;
  updateSettings: (partial: Partial<RMHboxUserSettings>) => void;
  leaveLobby: () => void;
  reset: () => void;
}

// ─── Store Implementation ────────────────────────────────────────

export const useRMHboxStore = create<RMHboxStore>()(
  persist(
    (set, get) => ({
      connectionStatus: 'disconnected',
      lobby: null,
      gameState: {},
      lastSeq: -1,
      settings: { ...DEFAULT_SETTINGS },
      timerInfo: null,
      minigameRound: null,

      setConnectionStatus: (status) => set({ connectionStatus: status }),

      applyAction: (action) => {
        const state = get();
        // Skip out-of-order or duplicate actions
        if (action.seq <= state.lastSeq) return;

        const updatedLobby = state.lobby
          ? applyLobbyAction(state.lobby, action)
          : state.lobby;
        const updatedGame = applyGameAction(state.gameState, action);

        set({
          lobby: updatedLobby,
          gameState: updatedGame,
          lastSeq: action.seq,
        });
      },

      applyFullSync: (fullState) => {
        set({
          lobby: fullState,
          lastSeq: fullState.seq,
        });
      },

      setGameState: (gameState) => set({ gameState }),

      setTimerInfo: (info) => set({ timerInfo: info }),

      setMinigameRound: (info) => set({ minigameRound: info }),

      updateSettings: (partial) => {
        set((state) => ({
          settings: { ...state.settings, ...partial },
        }));
      },

      leaveLobby: () => set({
        lobby: null,
        gameState: {},
        lastSeq: -1,
        timerInfo: null,
        minigameRound: null,
      }),

      reset: () => set({
        connectionStatus: 'disconnected',
        lobby: null,
        gameState: {},
        lastSeq: -1,
        timerInfo: null,
        minigameRound: null,
      }),
    }),
    {
      name: 'rmhbox-settings',
      // Only persist the settings field to localStorage
      partialize: (state) => ({ settings: state.settings }),
      // Deep-merge settings so new fields (e.g. theme) get their defaults
      // even when the stored object was saved before those fields existed.
      merge: (persisted, current) => {
        const p = persisted as { settings?: Partial<RMHboxUserSettings> } | undefined;
        return {
          ...(current as RMHboxStore),
          settings: {
            ...DEFAULT_SETTINGS,
            ...(p?.settings ?? {}),
          },
        };
      },
    },
  ),
);

// ─── Lobby Action Reducer ────────────────────────────────────────

/**
 * Applies a lobby-level action to the current ClientLobbyState.
 * Returns a new state object with the action applied.
 */
export function applyLobbyAction(
  lobby: ClientLobbyState,
  action: GameAction,
): ClientLobbyState {
  const { type, payload } = action;
  const data = (payload ?? {}) as Record<string, unknown>;

  switch (type) {
    case 'PLAYER_JOINED':
      return {
        ...lobby,
        players: [
          ...lobby.players,
          {
            userId: data.userId as string,
            userName: data.userName as string,
            avatarUrl: (data.avatarUrl as string | null) ?? null,
            isConnected: true,
            isReady: false,
            score: 0,
            roundScore: 0,
            isHost: false,
          },
        ],
      };

    case 'PLAYER_LEFT':
    case 'PLAYER_KICKED':
      return {
        ...lobby,
        players: lobby.players.filter((p) => p.userId !== data.userId),
      };

    case 'SPECTATOR_JOINED':
      return {
        ...lobby,
        spectators: [
          ...lobby.spectators,
          {
            userId: data.userId as string,
            userName: data.userName as string,
            avatarUrl: (data.avatarUrl as string | null) ?? null,
            isConnected: true,
          },
        ],
      };

    case 'SPECTATOR_LEFT':
      return {
        ...lobby,
        spectators: lobby.spectators.filter((s) => s.userId !== data.userId),
      };

    case 'SPECTATOR_PROMOTED': {
      const promoted = lobby.spectators.find((s) => s.userId === data.userId);
      const isMe = data.userId === lobby.myUserId;
      // Build a player entry from the spectator data, or fall back to the action payload
      const newPlayer = promoted
        ? {
            userId: promoted.userId,
            userName: promoted.userName,
            avatarUrl: promoted.avatarUrl,
            isConnected: true,
            isReady: false,
            score: 0,
            roundScore: 0,
            isHost: false,
          }
        : {
            userId: data.userId as string,
            userName: (data.userName as string) ?? 'Player',
            avatarUrl: null,
            isConnected: true,
            isReady: false,
            score: 0,
            roundScore: 0,
            isHost: false,
          };
      // Only add if not already in the players list
      const alreadyPlayer = lobby.players.some((p) => p.userId === data.userId);
      return {
        ...lobby,
        myRole: isMe ? 'player' : lobby.myRole,
        spectators: lobby.spectators.filter((s) => s.userId !== data.userId),
        players: alreadyPlayer ? lobby.players : [...lobby.players, newPlayer],
      };
    }

    case 'HOST_TRANSFERRED':
      return {
        ...lobby,
        hostUserId: data.newHostUserId as string,
        players: lobby.players.map((p) => ({
          ...p,
          isHost: p.userId === data.newHostUserId,
        })),
      };

    case 'SETTINGS_UPDATED':
      return {
        ...lobby,
        settings: { ...lobby.settings, ...(data as object) },
      };

    case 'PLAYER_READY_CHANGED':
      return {
        ...lobby,
        players: lobby.players.map((p) =>
          p.userId === data.userId ? { ...p, isReady: data.isReady as boolean } : p,
        ),
      };

    case 'STATE_CHANGED': {
      const newState = data.state as ClientLobbyState['state'];
      // When returning to WAITING, clear game state but preserve selectedGame
      // (server auto-reselects the last played game via GAME_PICKED or full sync)
      if (newState === 'WAITING') {
        useRMHboxStore.setState({ timerInfo: null, minigameRound: null });
        return {
          ...lobby,
          state: newState,
          currentGame: null,
        };
      }
      return {
        ...lobby,
        state: newState,
      };
    }

    case 'CHAT_MESSAGE':
      return {
        ...lobby,
        chat: [
          ...lobby.chat,
          {
            id: data.id as string,
            userId: data.userId as string,
            userName: data.userName as string,
            content: data.content as string,
            timestamp: data.timestamp as number,
            type: (data.type as 'user' | 'system') ?? 'user',
          },
        ],
      };

    case 'PLAYER_CONNECTED':
      return {
        ...lobby,
        players: lobby.players.map((p) =>
          p.userId === data.userId ? { ...p, isConnected: true } : p,
        ),
      };

    case 'PLAYER_DISCONNECTED':
      return {
        ...lobby,
        players: lobby.players.map((p) =>
          p.userId === data.userId ? { ...p, isConnected: false } : p,
        ),
      };

    case 'VOTE_STARTED':
      return lobby; // Vote data comes via separate event

    case 'VOTE_CAST':
      return lobby; // Vote tallies come via separate event

    case 'VOTE_RESULT':
      return lobby; // Vote result handled by separate event

    case 'GAME_SELECTED':
      return {
        ...lobby,
        currentGame: data.game as ClientLobbyState['currentGame'],
      };

    case 'GAME_PICKED':
      return {
        ...lobby,
        selectedGame: {
          minigameId: data.minigameId as string,
          displayName: data.displayName as string,
        },
      };

    case 'TIMER_START': {
      // A timed phase is starting — store total + remaining for the header ring.
      // Sentinel value -1 means infinite (no countdown).
      const total = data.totalDuration as number;
      const remaining = data.timeRemaining as number;
      const infinite = total === -1;
      const showSkip = infinite ? (data.showSkip as boolean | undefined) ?? true : false;
      useRMHboxStore.setState({ timerInfo: { total, remaining, paused: false, infinite, showSkip } });
      if (lobby.currentGame && !infinite) {
        return {
          ...lobby,
          currentGame: { ...lobby.currentGame, timeRemaining: remaining },
        };
      }
      return lobby;
    }

    case 'TIMER_TICK': {
      const newTime = data.timeRemaining as number | null | undefined;
      if (typeof newTime === 'number' && newTime >= 0) {
        // Update centralized timer state
        const prev = useRMHboxStore.getState().timerInfo;
        useRMHboxStore.setState({
          timerInfo: prev
            ? { total: prev.total, remaining: newTime, paused: prev.paused, infinite: prev.infinite, showSkip: prev.showSkip }
            : { total: newTime, remaining: newTime, paused: false, infinite: false, showSkip: false },
        });
        // Also update currentGame.timeRemaining for backward compatibility
        if (lobby.currentGame) {
          return {
            ...lobby,
            currentGame: { ...lobby.currentGame, timeRemaining: newTime },
          };
        }
      }
      return lobby;
    }

    case 'TIMER_PAUSED': {
      const prev = useRMHboxStore.getState().timerInfo;
      const remaining = (data.timeRemaining as number) ?? prev?.remaining ?? 0;
      useRMHboxStore.setState({
        timerInfo: prev
          ? { total: prev.total, remaining, paused: true, infinite: prev.infinite, showSkip: prev.showSkip }
          : { total: remaining, remaining, paused: true, infinite: false, showSkip: false },
      });
      return lobby;
    }

    case 'TIMER_RESUMED': {
      const prev = useRMHboxStore.getState().timerInfo;
      const remaining = (data.timeRemaining as number) ?? prev?.remaining ?? 0;
      useRMHboxStore.setState({
        timerInfo: prev
          ? { total: prev.total, remaining, paused: false, infinite: prev.infinite, showSkip: prev.showSkip }
          : { total: remaining, remaining, paused: false, infinite: false, showSkip: false },
      });
      return lobby;
    }

    case 'MINIGAME_ROUND': {
      const current = data.current as number;
      const total = data.total as number;
      useRMHboxStore.setState({ minigameRound: { current, total } });
      return lobby;
    }

    default:
      return lobby;
  }
}

// ─── Game Action Reducer ─────────────────────────────────────────

/**
 * Applies a game-level action to the current game state.
 * Stores raw payloads for minigame components to consume.
 */
export function applyGameAction(
  gameState: Record<string, unknown>,
  action: GameAction,
): Record<string, unknown> {
  // Only process game-specific action types
  if (
    action.type.startsWith('PLAYER_') ||
    action.type.startsWith('SPECTATOR_') ||
    action.type.startsWith('HOST_') ||
    action.type.startsWith('SETTINGS_') ||
    action.type.startsWith('STATE_') ||
    action.type.startsWith('CHAT_') ||
    action.type.startsWith('VOTE_') ||
    action.type.startsWith('GAME_SELECTED') ||
    action.type.startsWith('GAME_PICKED') ||
    action.type.startsWith('TIMER_') ||
    action.type === 'MINIGAME_ROUND'
  ) {
    return gameState;
  }

  // Store game-specific actions as raw payload for minigame components
  return {
    ...gameState,
    lastAction: action,
    [action.type]: action.payload,
  };
}
