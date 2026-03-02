/**
 * RMH Study — Client-Side Zustand Store
 */

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
} from './types';
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
  connectionStatus: 'disconnected' | 'connecting' | 'connected' | 'error';
  room: ClientRoomState | null;
  settings: RmhStudyUserSettings;
  tasks: Task[];
  lastPhaseComplete: PhaseCompleteEvent | null;

  // Actions
  setConnectionStatus: (status: RmhStudyStore['connectionStatus']) => void;
  setRoom: (room: ClientRoomState | null) => void;
  updateMembers: (members: RoomMember[]) => void;
  addChatMessage: (msg: ChatMessage) => void;
  updateChatReaction: (messageId: string, reactions: Record<string, string[]>) => void;
  updateTimer: (timer: TimerState) => void;
  setTimerPaused: (phase: TimerState['phase'], remainingMs: number) => void;
  setTimerReset: () => void;
  setPhaseComplete: (event: PhaseCompleteEvent) => void;
  clearPhaseComplete: () => void;

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
      connectionStatus: 'disconnected',
      room: null,
      settings: { ...DEFAULT_SETTINGS },
      tasks: [],
      lastPhaseComplete: null,

      setConnectionStatus: (status) => set({ connectionStatus: status }),

      setRoom: (room) => {
        const prev = get().room;
        // Only clear tasks when first joining a room (null → room), not on every state update
        const isInitialJoin = !prev && room !== null;
        set({
          room,
          ...(isInitialJoin ? { tasks: [], lastPhaseComplete: null } : {}),
        });
      },

      updateMembers: (members) => {
        const room = get().room;
        if (room) set({ room: { ...room, members } });
      },

      addChatMessage: (msg) => {
        const room = get().room;
        if (room) {
          set({ room: { ...room, chat: [...room.chat.slice(-199), msg] } });
        }
      },

      updateChatReaction: (messageId, reactions) => {
        const room = get().room;
        if (!room) return;
        set({
          room: {
            ...room,
            chat: room.chat.map((m) =>
              m.id === messageId ? { ...m, reactions } : m,
            ),
          },
        });
      },

      updateTimer: (timer) => {
        const room = get().room;
        if (room) set({ room: { ...room, timer } });
      },

      setTimerPaused: (phase, remainingMs) => {
        const room = get().room;
        if (room) {
          set({
            room: {
              ...room,
              timer: { ...room.timer, phase, remainingMs, isPaused: true },
            },
          });
        }
      },

      setTimerReset: () => {
        const room = get().room;
        if (room) {
          set({ room: { ...room, timer: { ...DEFAULT_TIMER, totalSessions: room.settings.sessionsBeforeLongBreak } } });
        }
      },

      setPhaseComplete: (event) => set({ lastPhaseComplete: event }),
      clearPhaseComplete: () => set({ lastPhaseComplete: null }),

      // Tasks (local + server)
      setTasks: (tasks) => set({ tasks }),
      addTask: (task) => set((state) => ({ tasks: [...state.tasks, task] })),
      toggleTask: (taskId) => set((state) => ({
        tasks: state.tasks.map((t) => t.id === taskId ? { ...t, completed: !t.completed } : t),
      })),
      deleteTask: (taskId) => set((state) => ({
        tasks: state.tasks.filter((t) => t.id !== taskId),
      })),

      updateSettings: (partial) => {
        set((state) => ({
          settings: { ...state.settings, ...partial },
        }));
      },

      leaveRoom: () => set({
        room: null,
        tasks: [],
        lastPhaseComplete: null,
      }),

      reset: () => set({
        connectionStatus: 'disconnected',
        room: null,
        tasks: [],
        lastPhaseComplete: null,
      }),
    }),
    {
      name: 'rmhstudy-settings',
      partialize: (state) => ({ settings: state.settings }),
      merge: (persisted, current) => {
        const p = persisted as { settings?: Partial<RmhStudyUserSettings> } | undefined;
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
