/**
 * RMH Type — Client-Side Zustand Store
 */

import type { RealtimeStatus, PeerWaitState } from '@/lib/shared/realtime/types';
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
  SoloChallenge,
  SoloChallengeRefusal,
  SoloChallengeResult,
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
  /** Draw a second caret at the pace of the member's best run on the passage (default on). */
  raceGhost: boolean;
  /** Fold finished runs into the member's per-key counters (default on; lib/rmhtype/record-keystats.ts). */
  recordKeyStats: boolean;
}

const DEFAULT_SETTINGS: RmhTypeUserSettings = {
  theme: 'dark',
  showChat: true,
  soundEffects: true,
  soloDifficulty: 'medium',
  soloPassageLength: 'medium',
  raceGhost: true,
  recordKeyStats: true,
};

const RMHTYPE_SETTINGS_KEY = 'rmhtype-settings';

// ─── Store Interface ─────────────────────────────────────────────

export interface RmhTypeStore {
  connectionStatus: RealtimeStatus;
  /** Peers the room is paused on, or null when nobody is being waited for. */
  peersWaiting: PeerWaitState | null;
  room: ClientRoomState | null;
  settings: RmhTypeUserSettings;

  // Solo mode
  soloPassage: string | null;
  soloPassageId: string | null;
  soloResult: SoloResult | null;
  soloCountdown: number | null;
  /**
   * The topic whose passage is being written right now, or null.
   *
   * Solo start is normally instant; asking for a topic puts a multi-second
   * DeepSeek call in front of the countdown, and this is what the solo page
   * shows during it so the button press does not look ignored.
   */
  soloGeneratingTopic: string | null;
  /**
   * A generated practice test waiting for the solo page to pick it up (the "Practise these keys" button on the
   * progress page). Never persisted; the solo page takes it once and clears it.
   */
  pendingPractice: string | null;
  /** The challenge race this solo run is (s11-12), its settled result, or why the server refused to start it. */
  soloChallenge: SoloChallenge | null;
  soloChallengeResult: SoloChallengeResult | null;
  soloChallengeRefusal: SoloChallengeRefusal | null;

  // Actions
  setConnectionStatus: (status: RmhTypeStore['connectionStatus']) => void;
  setPeersWaiting: (waiting: PeerWaitState | null) => void;
  setRoom: (room: ClientRoomState | null) => void;
  updateRoomPlayers: (players: RoomPlayer[]) => void;
  updateRoomStatus: (status: ClientRoomState['status']) => void;
  addChatMessage: (msg: ChatMessage) => void;
  setPassage: (passageId: string, text: string, round: number, totalRounds: number) => void;
  updateProgress: (progress: PlayerProgress) => void;
  markPlayerFinished: (result: {
    userId: string;
    userName: string;
    wpm: number;
    accuracy: number;
    timeMs: number;
    rank: number;
  }) => void;
  setRoundResults: (results: RoundResults) => void;
  setFinalResults: (results: FinalResults) => void;
  setCountdown: (seconds: number | null) => void;

  // Solo
  setSoloPassage: (passageId: string, text: string, challenge?: SoloChallenge | null) => void;
  setSoloChallengeResult: (result: SoloChallengeResult | null) => void;
  setSoloChallengeRefusal: (refusal: SoloChallengeRefusal | null) => void;
  setSoloResult: (result: SoloResult) => void;
  setSoloCountdown: (seconds: number | null) => void;
  setSoloGeneratingTopic: (topic: string | null) => void;
  clearSolo: () => void;
  setPendingPractice: (text: string | null) => void;

  updateSettings: (partial: Partial<RmhTypeUserSettings>) => void;
  leaveRoom: () => void;
  reset: () => void;
}

// ─── Store Implementation ────────────────────────────────────────

export const useRmhTypeStore = create<RmhTypeStore>()(
  persist(
    (set, get) => ({
      connectionStatus: 'idle',
      peersWaiting: null,
      room: null,
      settings: {
        ...DEFAULT_SETTINGS,
      },
      soloPassage: null,
      soloPassageId: null,
      soloResult: null,
      soloCountdown: null,
      soloGeneratingTopic: null,
      pendingPractice: null,
      soloChallenge: null,
      soloChallengeResult: null,
      soloChallengeRefusal: null,

      setConnectionStatus: (status) =>
        set({
          connectionStatus: status,
        }),
      setPeersWaiting: (waiting) =>
        set({
          peersWaiting: waiting,
        }),

      setRoom: (room) =>
        set({
          room,
        }),

      updateRoomPlayers: (players) => {
        const room = get().room;
        if (room)
          set({
            room: {
              ...room,
              players,
            },
          });
      },

      updateRoomStatus: (status) => {
        const room = get().room;
        if (room)
          set({
            room: {
              ...room,
              status,
            },
          });
      },

      addChatMessage: (msg) => {
        const room = get().room;
        if (room) {
          set({
            room: {
              ...room,
              chat: [...room.chat.slice(-199), msg],
            },
          });
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
              p.userId === progress.userId
                ? {
                    ...p,
                    ...progress,
                  }
                : p,
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
              p.userId === result.userId
                ? {
                    ...p,
                    finished: true,
                    wpm: result.wpm,
                  }
                : p,
            ),
          },
        });
      },

      setRoundResults: (results) => {
        const room = get().room;
        if (room) {
          set({
            room: {
              ...room,
              roundResults: results,
              status: 'ROUND_RESULTS',
            },
          });
        }
      },

      setFinalResults: (results) => {
        const room = get().room;
        if (room) {
          set({
            room: {
              ...room,
              finalResults: results,
              status: 'FINAL_RESULTS',
            },
          });
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
      setSoloPassage: (passageId, text, challenge = null) =>
        set({
          soloPassageId: passageId,
          soloPassage: text,
          soloResult: null,
          soloChallenge: challenge,
          soloChallengeResult: null,
        }),
      setSoloChallengeResult: (result) => set({ soloChallengeResult: result }),
      setSoloChallengeRefusal: (refusal) => set({ soloChallengeRefusal: refusal }),
      setSoloResult: (result) =>
        set({
          soloResult: result,
        }),
      setSoloCountdown: (seconds) =>
        set({
          soloCountdown: seconds,
        }),
      setSoloGeneratingTopic: (topic) =>
        set({
          soloGeneratingTopic: topic,
        }),
      setPendingPractice: (text) => set({ pendingPractice: text }),
      clearSolo: () =>
        set({
          soloPassage: null,
          soloPassageId: null,
          soloResult: null,
          soloCountdown: null,
          soloGeneratingTopic: null,
          soloChallenge: null,
          soloChallengeResult: null,
          soloChallengeRefusal: null,
        }),

      updateSettings: (partial) => {
        set((state) => ({
          settings: {
            ...state.settings,
            ...partial,
          },
        }));
      },

      leaveRoom: () =>
        set({
          room: null,
        }),

      reset: () =>
        set({
          connectionStatus: 'disconnected',
          peersWaiting: null,
          room: null,
          soloPassage: null,
          soloPassageId: null,
          soloResult: null,
          soloCountdown: null,
          soloGeneratingTopic: null,
          soloChallenge: null,
          soloChallengeResult: null,
          soloChallengeRefusal: null,
        }),
    }),
    {
      name: RMHTYPE_SETTINGS_KEY,
      partialize: (state) => ({
        settings: state.settings,
      }),
      merge: (persisted, current) => {
        const p = persisted as
          | {
              settings?: Partial<RmhTypeUserSettings>;
            }
          | undefined;
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
