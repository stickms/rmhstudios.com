/**
 * RmhTube — Client-Side Zustand Store
 *
 * Central state management for the RmhTube client.
 * Handles connection status, room state, video sync,
 * and user settings with localStorage persistence.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  ClientRoomState,
  ClientMemberInfo,
  ClientQueueItem,
  ChatMessage,
  RoomAction,
  VideoState,
} from './types';

// ─── User Settings ───────────────────────────────────────────────

export interface RmhTubeUserSettings {
  masterVolume: number;
  showChat: boolean;
  chatPosition: 'left' | 'right';
  theme: 'dark' | 'light';
  autoFullscreen: boolean;
}

const DEFAULT_SETTINGS: RmhTubeUserSettings = {
  masterVolume: 0.7,
  showChat: true,
  chatPosition: 'right',
  theme: 'dark',
  autoFullscreen: false,
};

// ─── Store Interface ─────────────────────────────────────────────

export interface RmhTubeStore {
  connectionStatus: 'disconnected' | 'connecting' | 'connected' | 'error';
  room: ClientRoomState | null;
  lastSeq: number;
  settings: RmhTubeUserSettings;

  // Actions
  setConnectionStatus: (status: RmhTubeStore['connectionStatus']) => void;
  applyAction: (action: RoomAction) => void;
  applyFullSync: (fullState: ClientRoomState) => void;
  updateVideoState: (videoState: VideoState) => void;
  updateSettings: (partial: Partial<RmhTubeUserSettings>) => void;
  leaveRoom: () => void;
  reset: () => void;
}

// ─── Store Implementation ────────────────────────────────────────

export const useRmhTubeStore = create<RmhTubeStore>()(
  persist(
    (set, get) => ({
      connectionStatus: 'disconnected',
      room: null,
      lastSeq: -1,
      settings: { ...DEFAULT_SETTINGS },

      setConnectionStatus: (status) => set({ connectionStatus: status }),

      applyAction: (action) => {
        const state = get();
        if (action.seq <= state.lastSeq) return;

        const updatedRoom = state.room
          ? applyRoomAction(state.room, action)
          : state.room;

        set({
          room: updatedRoom,
          lastSeq: action.seq,
        });
      },

      applyFullSync: (fullState) => {
        set({
          room: fullState,
          lastSeq: fullState.seq,
        });
      },

      updateVideoState: (videoState) => {
        set((state) => ({
          room: state.room ? { ...state.room, videoState } : null,
        }));
      },

      updateSettings: (partial) => {
        set((state) => ({
          settings: { ...state.settings, ...partial },
        }));
      },

      leaveRoom: () => set({
        room: null,
        lastSeq: -1,
      }),

      reset: () => set({
        connectionStatus: 'disconnected',
        room: null,
        lastSeq: -1,
      }),
    }),
    {
      name: 'rmhtube-settings',
      partialize: (state) => ({ settings: state.settings }),
      merge: (persisted, current) => {
        const p = persisted as { settings?: Partial<RmhTubeUserSettings> } | undefined;
        return {
          ...(current as RmhTubeStore),
          settings: {
            ...DEFAULT_SETTINGS,
            ...(p?.settings ?? {}),
          },
        };
      },
    },
  ),
);

// ─── Room Action Reducer ─────────────────────────────────────────

export function applyRoomAction(
  room: ClientRoomState,
  action: RoomAction,
): ClientRoomState {
  const { type, payload } = action;
  const data = (payload ?? {}) as Record<string, unknown>;

  switch (type) {
    case 'MEMBER_JOINED':
      return {
        ...room,
        members: [
          ...room.members,
          {
            userId: data.userId as string,
            userName: data.userName as string,
            avatarUrl: (data.avatarUrl as string | null) ?? null,
            isConnected: true,
            isHost: false,
          },
        ],
      };

    case 'MEMBER_LEFT':
    case 'MEMBER_KICKED':
      return {
        ...room,
        members: room.members.filter((m) => m.userId !== data.userId),
      };

    case 'HOST_TRANSFERRED':
      return {
        ...room,
        hostUserId: data.newHostUserId as string,
        members: room.members.map((m) => ({
          ...m,
          isHost: m.userId === data.newHostUserId,
        })),
      };

    case 'SETTINGS_UPDATED':
      return {
        ...room,
        settings: { ...room.settings, ...(data as object) },
      };

    case 'MEMBER_CONNECTED':
      return {
        ...room,
        members: room.members.map((m) =>
          m.userId === data.userId ? { ...m, isConnected: true } : m,
        ),
      };

    case 'MEMBER_DISCONNECTED':
      return {
        ...room,
        members: room.members.map((m) =>
          m.userId === data.userId ? { ...m, isConnected: false } : m,
        ),
      };

    case 'CHAT_MESSAGE':
      return {
        ...room,
        chat: [
          ...room.chat,
          {
            id: data.id as string,
            userId: data.userId as string,
            userName: data.userName as string,
            content: data.content as string,
            createdAt: data.createdAt as number,
          },
        ],
      };

    case 'QUEUE_ITEM_ADDED':
      return {
        ...room,
        queue: [
          ...room.queue,
          data.item as ClientQueueItem,
        ],
      };

    case 'QUEUE_ITEM_REMOVED':
      return {
        ...room,
        queue: room.queue.filter((q) => q.id !== data.itemId),
      };

    case 'QUEUE_REORDERED':
      return {
        ...room,
        queue: data.queue as ClientQueueItem[],
      };

    case 'NOW_PLAYING':
      return {
        ...room,
        currentItem: (data.item as ClientQueueItem) ?? null,
        currentIndex: data.index as number,
        videoState: {
          playing: false,
          currentTime: 0,
          playbackRate: 1,
          updatedAt: Date.now(),
        },
        skipVotes: [],
      };

    case 'PLAYBACK_ENDED':
      return {
        ...room,
        currentItem: null,
        currentIndex: -1,
        videoState: {
          playing: false,
          currentTime: 0,
          playbackRate: 1,
          updatedAt: Date.now(),
        },
        skipVotes: [],
      };

    case 'VOTE_SKIP_UPDATED':
      return {
        ...room,
        skipVotes: data.voters as string[],
      };

    case 'VOTE_SKIP_PASSED':
      return {
        ...room,
        skipVotes: [],
      };

    default:
      return room;
  }
}
