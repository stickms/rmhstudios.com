/**
 * RmhTube — Client-Side Zustand Store
 *
 * Central state management for the RmhTube client.
 * Handles connection status, room state, video sync,
 * and user settings with localStorage persistence.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { nanoid } from 'nanoid';
import type {
  ClientRoomState,
  ClientMemberInfo,
  ClientQueueItem,
  ChatMessage,
  SystemMessage,
  ChatEntry,
  RoomAction,
  VideoState,
  RoomHistoryEntry,
} from './types';

// ─── User Settings ───────────────────────────────────────────────

export interface RmhTubeUserSettings {
  masterVolume: number;
  muted: boolean;
  captionsEnabled: boolean;
  showChat: boolean;
  chatPosition: 'left' | 'right';
  theme: 'dark' | 'light' | 'high-contrast';
  autoFullscreen: boolean;
  // Phase 1
  showTimestamps: boolean;
  showSystemMessages: boolean;
  // Phase 2
  theaterMode: boolean;
  // Phase 4
  roomHistory: RoomHistoryEntry[];
  favoriteRooms: string[];
  // Phase 5
  hasSeenTour: boolean;
  desktopNotifications: boolean;
  notifyOnMention: boolean;
  notifyOnAllMessages: boolean;
  soundEffects: boolean;
  soundVolume: number;
  layoutDensity: 'compact' | 'comfortable' | 'spacious';
}

const DEFAULT_SETTINGS: RmhTubeUserSettings = {
  masterVolume: 0.7,
  muted: false,
  captionsEnabled: false,
  showChat: true,
  chatPosition: 'right',
  theme: 'dark',
  autoFullscreen: false,
  showTimestamps: true,
  showSystemMessages: true,
  theaterMode: false,
  roomHistory: [],
  favoriteRooms: [],
  hasSeenTour: false,
  desktopNotifications: false,
  notifyOnMention: true,
  notifyOnAllMessages: false,
  soundEffects: false,
  soundVolume: 0.5,
  layoutDensity: 'comfortable',
};

// ─── Store Interface ─────────────────────────────────────────────

export interface RmhTubeStore {
  connectionStatus: 'disconnected' | 'connecting' | 'connected' | 'error';
  room: ClientRoomState | null;
  lastSeq: number;
  settings: RmhTubeUserSettings;
  // Phase 1: System messages (client-side only)
  systemMessages: SystemMessage[];

  // Actions
  setConnectionStatus: (status: RmhTubeStore['connectionStatus']) => void;
  applyAction: (action: RoomAction) => void;
  applyFullSync: (fullState: ClientRoomState) => void;
  updateVideoState: (videoState: VideoState) => void;
  updateSettings: (partial: Partial<RmhTubeUserSettings>) => void;
  addSystemMessage: (event: SystemMessage['event'], content: string) => void;
  leaveRoom: () => void;
  reset: () => void;
  // Phase 4: Room History
  addRoomToHistory: (entry: RoomHistoryEntry) => void;
  removeRoomFromHistory: (roomId: string) => void;
  toggleFavoriteRoom: (roomId: string) => void;
}

// ─── Store Implementation ────────────────────────────────────────

export const useRmhTubeStore = create<RmhTubeStore>()(
  persist(
    (set, get) => ({
      connectionStatus: 'disconnected',
      room: null,
      lastSeq: -1,
      settings: { ...DEFAULT_SETTINGS },
      systemMessages: [],

      setConnectionStatus: (status) => set({ connectionStatus: status }),

      applyAction: (action) => {
        const state = get();
        if (action.seq <= state.lastSeq) return;

        const updatedRoom = state.room
          ? applyRoomAction(state.room, action, state)
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
          systemMessages: [],
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

      addSystemMessage: (event, content) => {
        if (!get().settings.showSystemMessages) return;
        const msg: SystemMessage = {
          id: `sys-${nanoid(8)}`,
          type: 'system',
          event,
          content,
          createdAt: Date.now(),
        };
        set((state) => ({
          systemMessages: [...state.systemMessages.slice(-100), msg],
        }));
      },

      leaveRoom: () => set({
        room: null,
        lastSeq: -1,
        systemMessages: [],
      }),

      reset: () => set({
        connectionStatus: 'disconnected',
        room: null,
        lastSeq: -1,
        systemMessages: [],
      }),

      addRoomToHistory: (entry) => {
        set((state) => {
          const history = state.settings.roomHistory.filter(
            (r) => r.roomId !== entry.roomId,
          );
          history.unshift(entry);
          return {
            settings: {
              ...state.settings,
              roomHistory: history.slice(0, 20),
            },
          };
        });
      },

      removeRoomFromHistory: (roomId) => {
        set((state) => ({
          settings: {
            ...state.settings,
            roomHistory: state.settings.roomHistory.filter((r) => r.roomId !== roomId),
            favoriteRooms: state.settings.favoriteRooms.filter((id) => id !== roomId),
          },
        }));
      },

      toggleFavoriteRoom: (roomId) => {
        set((state) => {
          const favs = state.settings.favoriteRooms;
          const next = favs.includes(roomId)
            ? favs.filter((id) => id !== roomId)
            : [...favs.slice(0, 9), roomId];
          return {
            settings: { ...state.settings, favoriteRooms: next },
          };
        });
      },
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
  store?: RmhTubeStore,
): ClientRoomState {
  const { type, payload } = action;
  const data = (payload ?? {}) as Record<string, unknown>;

  switch (type) {
    case 'MEMBER_JOINED':
      store?.addSystemMessage('join', `${data.userName} joined the room`);
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
            isLeader: false,
            role: 'member' as const,
            status: 'watching' as const,
          },
        ],
      };

    case 'MEMBER_LEFT':
      store?.addSystemMessage('leave', `${room.members.find(m => m.userId === data.userId)?.userName ?? 'Someone'} left the room`);
      return {
        ...room,
        members: room.members.filter((m) => m.userId !== data.userId),
      };

    case 'MEMBER_KICKED':
      store?.addSystemMessage('kick', `${room.members.find(m => m.userId === data.userId)?.userName ?? 'Someone'} was kicked`);
      return {
        ...room,
        members: room.members.filter((m) => m.userId !== data.userId),
      };

    case 'HOST_TRANSFERRED': {
      const newHostId = data.newHostUserId as string;
      const newLeaderId = (data.newLeaderUserId as string) ?? newHostId;
      store?.addSystemMessage('host_transfer', `${data.newHostUserName} is now the host`);
      return {
        ...room,
        hostUserId: newHostId,
        leaderUserId: newLeaderId,
        members: room.members.map((m) => ({
          ...m,
          isHost: m.userId === newHostId,
          isLeader: m.userId === newLeaderId,
          role: m.userId === newHostId ? 'host' as const : (m.role === 'host' ? 'member' as const : m.role),
        })),
      };
    }

    case 'SETTINGS_UPDATED':
      store?.addSystemMessage('settings_change', 'Room settings were updated');
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
            replyToId: (data.replyToId as string | null) ?? null,
            replyToContent: (data.replyToContent as string | null) ?? null,
            replyToUserName: (data.replyToUserName as string | null) ?? null,
            mentions: (data.mentions as string[]) ?? [],
            reactions: (data.reactions as Record<string, string[]>) ?? {},
            timestamp: (data.timestamp as number | null) ?? null,
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

    case 'NOW_PLAYING': {
      const prevItem = room.currentItem;
      store?.addSystemMessage('now_playing', `Now playing: ${(data.item as ClientQueueItem)?.title ?? 'Unknown'}`);
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
        playedItems: prevItem
          ? [...room.playedItems.slice(-49), prevItem]
          : room.playedItems,
      };
    }

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

    // Phase 1: Chat Reactions
    case 'CHAT_REACTION': {
      const msgId = data.messageId as string;
      const reactions = data.reactions as Record<string, string[]>;
      return {
        ...room,
        chat: room.chat.map((msg) =>
          msg.id === msgId ? { ...msg, reactions } : msg,
        ),
      };
    }

    // Phase 1: Pinned Messages
    case 'MESSAGE_PINNED':
      return {
        ...room,
        pinnedMessage: data.message as ChatMessage,
      };

    case 'MESSAGE_UNPINNED':
      return {
        ...room,
        pinnedMessage: null,
      };

    // Phase 3: Queue Voting
    case 'QUEUE_VOTE_UPDATED': {
      const itemId = data.itemId as string;
      const votes = data.votes as number;
      const voters = data.voters as string[];
      return {
        ...room,
        queue: room.queue.map((q) =>
          q.id === itemId
            ? { ...q, votes, votedByMe: voters.includes(room.myUserId) }
            : q,
        ),
      };
    }

    // Phase 3: Queue History
    case 'QUEUE_HISTORY_UPDATED':
      return {
        ...room,
        playedItems: data.playedItems as ClientQueueItem[],
      };

    // Leader changed
    case 'LEADER_CHANGED': {
      const newLeaderId = data.newLeaderUserId as string;
      store?.addSystemMessage('leader_change', `${data.newLeaderUserName} is now the leader`);
      return {
        ...room,
        leaderUserId: newLeaderId,
        members: room.members.map((m) => ({
          ...m,
          isLeader: m.userId === newLeaderId,
        })),
      };
    }

    // Phase 4: Ban list
    case 'MEMBER_BANNED':
      return {
        ...room,
        members: room.members.filter((m) => m.userId !== data.userId),
        bannedUsers: [
          ...room.bannedUsers,
          {
            userId: data.userId as string,
            userName: data.userName as string,
            bannedAt: data.bannedAt as number,
            bannedBy: data.bannedBy as string,
            reason: (data.reason as string | null) ?? null,
          },
        ],
      };

    case 'MEMBER_UNBANNED':
      return {
        ...room,
        bannedUsers: room.bannedUsers.filter((b) => b.userId !== data.userId),
      };

    // Phase 4: User Presence Status
    case 'MEMBER_STATUS_CHANGED':
      return {
        ...room,
        members: room.members.map((m) =>
          m.userId === data.userId
            ? { ...m, status: data.status as ClientMemberInfo['status'] }
            : m,
        ),
      };

    default:
      return room;
  }
}

// ─── Helper: Get combined chat entries (messages + system) ───────

export function getChatEntries(store: RmhTubeStore): ChatEntry[] {
  const messages: ChatEntry[] = store.room?.chat ?? [];
  const system: ChatEntry[] = store.systemMessages;
  return [...messages, ...system].sort((a, b) => a.createdAt - b.createdAt);
}
