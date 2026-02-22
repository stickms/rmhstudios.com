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
}

const DEFAULT_SETTINGS: RMHboxUserSettings = {
  masterVolume: 0.7,
  sfxVolume: 0.8,
  musicVolume: 0.5,
  showChat: true,
  chatPosition: 'right',
};

// ─── Store Interface ─────────────────────────────────────────────

export interface RMHboxStore {
  connectionStatus: 'disconnected' | 'connecting' | 'connected' | 'error';
  lobby: ClientLobbyState | null;
  gameState: Record<string, unknown>;
  lastSeq: number;
  settings: RMHboxUserSettings;

  // Actions
  setConnectionStatus: (status: RMHboxStore['connectionStatus']) => void;
  applyAction: (action: GameAction) => void;
  applyFullSync: (fullState: ClientLobbyState) => void;
  setGameState: (state: Record<string, unknown>) => void;
  updateSettings: (partial: Partial<RMHboxUserSettings>) => void;
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

      updateSettings: (partial) => {
        set((state) => ({
          settings: { ...state.settings, ...partial },
        }));
      },

      reset: () => set({
        connectionStatus: 'disconnected',
        lobby: null,
        gameState: {},
        lastSeq: -1,
      }),
    }),
    {
      name: 'rmhbox-settings',
      // Only persist the settings field to localStorage
      partialize: (state) => ({ settings: state.settings }),
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
      return {
        ...lobby,
        spectators: lobby.spectators.filter((s) => s.userId !== data.userId),
        players: promoted
          ? [
              ...lobby.players,
              {
                userId: promoted.userId,
                userName: promoted.userName,
                avatarUrl: promoted.avatarUrl,
                isConnected: true,
                isReady: false,
                score: 0,
                roundScore: 0,
                isHost: false,
              },
            ]
          : lobby.players,
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
        settings: { ...lobby.settings, ...(data.settings as object) },
      };

    case 'PLAYER_READY_CHANGED':
      return {
        ...lobby,
        players: lobby.players.map((p) =>
          p.userId === data.userId ? { ...p, isReady: data.isReady as boolean } : p,
        ),
      };

    case 'STATE_CHANGED':
      return {
        ...lobby,
        state: data.state as ClientLobbyState['state'],
      };

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
    action.type.startsWith('GAME_SELECTED')
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
