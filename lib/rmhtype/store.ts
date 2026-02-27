/**
 * RMH Type — Client-Side Zustand Store
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  ClientRoomState,
  RoomPlayer,
  PlayerProgress,
  RoundResults,
  FinalResults,
  ChatMessage,
  SoloResult,
  Difficulty,
  PassageLength,
} from './types';

// ─── User Settings ───────────────────────────────────────────────

export interface RmhTypeUserSettings {
  theme: 'dark' | 'light';
  showChat: boolean;
  soundEffects: boolean;
  // Solo preferences
  soloDifficulty: Difficulty;
  soloPassageLength: PassageLength;
}

const DEFAULT_SETTINGS: RmhTypeUserSettings = {
  theme: 'dark',
  showChat: true,
  soundEffects: true,
  soloDifficulty: 'medium',
  soloPassageLength: 'medium',
};

// ─── Store Interface ─────────────────────────────────────────────

export interface RmhTypeStore {
  connectionStatus: 'disconnected' | 'connecting' | 'connected' | 'error';
  room: ClientRoomState | null;
  settings: RmhTypeUserSettings;

  // Solo mode
  soloPassage: string | null;
  soloPassageId: string | null;
  soloResult: SoloResult | null;
  soloCountdown: number | null;

  // Actions
  setConnectionStatus: (status: RmhTypeStore['connectionStatus']) => void;
  setRoom: (room: ClientRoomState | null) => void;
  updateRoomPlayers: (players: RoomPlayer[]) => void;
  updateRoomStatus: (status: ClientRoomState['status']) => void;
  addChatMessage: (msg: ChatMessage) => void;
  setPassage: (passageId: string, text: string, round: number, totalRounds: number) => void;
  updateProgress: (progress: PlayerProgress) => void;
  markPlayerFinished: (result: { userId: string; userName: string; wpm: number; accuracy: number; timeMs: number; rank: number }) => void;
  setRoundResults: (results: RoundResults) => void;
  setFinalResults: (results: FinalResults) => void;
  setCountdown: (seconds: number | null) => void;

  // Solo
  setSoloPassage: (passageId: string, text: string) => void;
  setSoloResult: (result: SoloResult) => void;
  setSoloCountdown: (seconds: number | null) => void;
  clearSolo: () => void;

  updateSettings: (partial: Partial<RmhTypeUserSettings>) => void;
  leaveRoom: () => void;
  reset: () => void;
}

// ─── Store Implementation ────────────────────────────────────────

export const useRmhTypeStore = create<RmhTypeStore>()(
  persist(
    (set, get) => ({
      connectionStatus: 'disconnected',
      room: null,
      settings: { ...DEFAULT_SETTINGS },
      soloPassage: null,
      soloPassageId: null,
      soloResult: null,
      soloCountdown: null,

      setConnectionStatus: (status) => set({ connectionStatus: status }),

      setRoom: (room) => set({ room }),

      updateRoomPlayers: (players) => {
        const room = get().room;
        if (room) set({ room: { ...room, players } });
      },

      updateRoomStatus: (status) => {
        const room = get().room;
        if (room) set({ room: { ...room, status } });
      },

      addChatMessage: (msg) => {
        const room = get().room;
        if (room) {
          set({ room: { ...room, chat: [...room.chat.slice(-199), msg] } });
        }
      },

      setPassage: (passageId, text, round, totalRounds) => {
        const room = get().room;
        if (room) {
          set({
            room: {
              ...room,
              passageId,
              passage: text,
              currentRound: round,
              totalRounds,
              status: 'TYPING',
              progress: room.players.map((p) => ({
                userId: p.userId,
                userName: p.userName,
                charsTyped: 0,
                totalChars: text.length,
                wpm: 0,
                finished: false,
              })),
              roundResults: null,
            },
          });
        }
      },

      updateProgress: (progress) => {
        const room = get().room;
        if (!room) return;
        set({
          room: {
            ...room,
            progress: room.progress.map((p) =>
              p.userId === progress.userId ? { ...p, ...progress } : p,
            ),
          },
        });
      },

      markPlayerFinished: (result) => {
        const room = get().room;
        if (!room) return;
        set({
          room: {
            ...room,
            progress: room.progress.map((p) =>
              p.userId === result.userId ? { ...p, finished: true, wpm: result.wpm } : p,
            ),
          },
        });
      },

      setRoundResults: (results) => {
        const room = get().room;
        if (room) {
          set({ room: { ...room, roundResults: results, status: 'ROUND_RESULTS' } });
        }
      },

      setFinalResults: (results) => {
        const room = get().room;
        if (room) {
          set({ room: { ...room, finalResults: results, status: 'FINAL_RESULTS' } });
        }
      },

      setCountdown: (seconds) => {
        const room = get().room;
        if (room) {
          set({
            room: {
              ...room,
              countdownSeconds: seconds,
              status: seconds !== null ? 'COUNTDOWN' : room.status,
            },
          });
        }
      },

      // Solo
      setSoloPassage: (passageId, text) => set({ soloPassageId: passageId, soloPassage: text, soloResult: null }),
      setSoloResult: (result) => set({ soloResult: result }),
      setSoloCountdown: (seconds) => set({ soloCountdown: seconds }),
      clearSolo: () => set({ soloPassage: null, soloPassageId: null, soloResult: null, soloCountdown: null }),

      updateSettings: (partial) => {
        set((state) => ({
          settings: { ...state.settings, ...partial },
        }));
      },

      leaveRoom: () => set({
        room: null,
      }),

      reset: () => set({
        connectionStatus: 'disconnected',
        room: null,
        soloPassage: null,
        soloPassageId: null,
        soloResult: null,
        soloCountdown: null,
      }),
    }),
    {
      name: 'rmhtype-settings',
      partialize: (state) => ({ settings: state.settings }),
      merge: (persisted, current) => {
        const p = persisted as { settings?: Partial<RmhTypeUserSettings> } | undefined;
        return {
          ...(current as RmhTypeStore),
          settings: {
            ...DEFAULT_SETTINGS,
            ...(p?.settings ?? {}),
          },
        };
      },
    },
  ),
);
