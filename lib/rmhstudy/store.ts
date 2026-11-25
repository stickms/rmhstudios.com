/**
 * RMH Study — Client-Side Zustand Store
 */

import type { RealtimeStatus, PeerWaitState } from '@/lib/shared/realtime/types';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  ClientRoomState,
  RoomMember,
  ChatMessage,
  TimerState,
  TimerSettings,
  Task,
  PhaseCompleteEvent,
  MemberStatus,
  RoomQuizClientState,
} from './types';
import type { EndView, PublicQuestion, QuizSnapshot, RevealView } from './quiz';
import { DEFAULT_TIMER_SETTINGS } from './types';

// ─── User Settings ───────────────────────────────────────────────

export interface RmhStudyUserSettings {
  theme: 'dark' | 'light';
  showChat: boolean;
  soundEffects: boolean;
  ambientSound: string | null;
  ambientVolume: number;
}

const DEFAULT_SETTINGS: RmhStudyUserSettings = {
  theme: 'dark',
  showChat: true,
  soundEffects: true,
  ambientSound: null,
  ambientVolume: 0.3,
};

// ─── Store Interface ─────────────────────────────────────────────

export interface RmhStudyStore {
  connectionStatus: RealtimeStatus;
  /** Peers the room is paused on, or null when nobody is being waited for. */
  peersWaiting: PeerWaitState | null;
  room: ClientRoomState | null;
  settings: RmhStudyUserSettings;
  tasks: Task[];
  lastPhaseComplete: PhaseCompleteEvent | null;
  /** The room quiz in progress (or its standings once over); null when none. */
  quiz: RoomQuizClientState | null;

  // Actions
  setConnectionStatus: (status: RmhStudyStore['connectionStatus']) => void;
  setPeersWaiting: (waiting: PeerWaitState | null) => void;
  setRoom: (room: ClientRoomState | null) => void;
  updateMembers: (members: RoomMember[]) => void;
  addChatMessage: (msg: ChatMessage) => void;
  updateChatReaction: (messageId: string, reactions: Record<string, string[]>) => void;
  updateTimer: (timer: TimerState) => void;
  setTimerPaused: (phase: TimerState['phase'], remainingMs: number) => void;
  setTimerReset: () => void;
  setPhaseComplete: (event: PhaseCompleteEvent) => void;
  clearPhaseComplete: () => void;

  // Room quiz
  setQuizQuestion: (question: PublicQuestion) => void;
  setQuizReveal: (reveal: RevealView) => void;
  setQuizEnd: (end: EndView) => void;
  setQuizSnapshot: (snapshot: QuizSnapshot | null) => void;
  dismissQuiz: () => void;

  // Tasks
  setTasks: (tasks: Task[]) => void;
  addTask: (task: Task) => void;
  toggleTask: (taskId: string) => void;
  deleteTask: (taskId: string) => void;

  updateSettings: (partial: Partial<RmhStudyUserSettings>) => void;
  leaveRoom: () => void;
  reset: () => void;
}

// ─── Default Timer State ─────────────────────────────────────────

const DEFAULT_TIMER: TimerState = {
  phase: 'idle',
  remainingMs: 0,
  totalMs: 0,
  sessionNumber: 0,
  totalSessions: 4,
  isPaused: false,
};

// ─── Store Implementation ────────────────────────────────────────

export const useRmhStudyStore = create<RmhStudyStore>()(
  persist(
    (set, get) => ({
      connectionStatus: 'idle',
      peersWaiting: null,
      room: null,
      settings: {
        ...DEFAULT_SETTINGS,
      },
      tasks: [],
      lastPhaseComplete: null,
      quiz: null,

      setConnectionStatus: (status) =>
        set({
          connectionStatus: status,
        }),
      setPeersWaiting: (waiting) =>
        set({
          peersWaiting: waiting,
        }),

      setRoom: (room) => {
        const prev = get().room;
        // Only clear tasks when first joining a room (null → room), not on every state update
        const isInitialJoin = !prev && room !== null;
        set({
          room,
          ...(isInitialJoin
            ? {
                tasks: [],
                lastPhaseComplete: null,
              }
            : {}),
        });
      },

      updateMembers: (members) => {
        const room = get().room;
        if (room)
          set({
            room: {
              ...room,
              members,
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

      updateChatReaction: (messageId, reactions) => {
        const room = get().room;
        if (!room) return;
        set({
          room: {
            ...room,
            chat: room.chat.map((m) =>
              m.id === messageId
                ? {
                    ...m,
                    reactions,
                  }
                : m,
            ),
          },
        });
      },

      updateTimer: (timer) => {
        const room = get().room;
        if (room)
          set({
            room: {
              ...room,
              timer,
            },
          });
      },

      setTimerPaused: (phase, remainingMs) => {
        const room = get().room;
        if (room) {
          set({
            room: {
              ...room,
              timer: {
                ...room.timer,
                phase,
                remainingMs,
                isPaused: true,
              },
            },
          });
        }
      },

      setTimerReset: () => {
        const room = get().room;
        if (room) {
          set({
            room: {
              ...room,
              timer: {
                ...DEFAULT_TIMER,
                totalSessions: room.settings.sessionsBeforeLongBreak,
              },
            },
          });
        }
      },

      setPhaseComplete: (event) =>
        set({
          lastPhaseComplete: event,
        }),
      clearPhaseComplete: () =>
        set({
          lastPhaseComplete: null,
        }),

      // Room quiz: the server sends every event to everyone; a member's own choice arrives in a snapshot.
      setQuizQuestion: (question) =>
        set({
          quiz: {
            phase: 'question',
            question,
            myChoice: null,
            canAnswer: true,
            reveal: null,
            standings: [],
            end: null,
          },
        }),
      setQuizReveal: (reveal) =>
        set((state) =>
          state.quiz ? { quiz: { ...state.quiz, phase: 'reveal', reveal, standings: reveal.standings } } : {},
        ),
      setQuizEnd: (end) =>
        set((state) => ({
          quiz: {
            phase: 'ended',
            question: state.quiz?.question ?? null,
            myChoice: null,
            canAnswer: false,
            reveal: null,
            standings: end.standings,
            end,
          },
        })),
      setQuizSnapshot: (snapshot) =>
        set({
          quiz: snapshot
            ? {
                phase: snapshot.phase,
                question: snapshot.question,
                myChoice: snapshot.myChoice,
                canAnswer: snapshot.canAnswer,
                reveal: snapshot.reveal,
                standings: snapshot.standings,
                end: null,
              }
            : null,
        }),
      dismissQuiz: () => set({ quiz: null }),

      // Tasks (local + server)
      setTasks: (tasks) =>
        set({
          tasks,
        }),
      addTask: (task) =>
        set((state) => ({
          tasks: [...state.tasks, task],
        })),
      toggleTask: (taskId) =>
        set((state) => ({
          tasks: state.tasks.map((t) =>
            t.id === taskId
              ? {
                  ...t,
                  completed: !t.completed,
                }
              : t,
          ),
        })),
      deleteTask: (taskId) =>
        set((state) => ({
          tasks: state.tasks.filter((t) => t.id !== taskId),
        })),

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
          tasks: [],
          lastPhaseComplete: null,
          quiz: null,
        }),

      reset: () =>
        set({
          connectionStatus: 'disconnected',
          peersWaiting: null,
          room: null,
          tasks: [],
          lastPhaseComplete: null,
          quiz: null,
        }),
    }),
    {
      name: 'rmhstudy-settings',
      partialize: (state) => ({
        settings: state.settings,
      }),
      merge: (persisted, current) => {
        const p = persisted as
          | {
              settings?: Partial<RmhStudyUserSettings>;
            }
          | undefined;
        return {
          ...(current as RmhStudyStore),
          settings: {
            ...DEFAULT_SETTINGS,
            ...(p?.settings ?? {}),
          },
        };
      },
    },
  ),
);
