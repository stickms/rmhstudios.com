/**
 * RmhTube — client store.
 *
 * Connection status, room state, the sync anchor, and the viewer's own
 * preferences (persisted to localStorage).
 */

import type { RealtimeStatus, PeerWaitState } from '@/lib/shared/realtime/types';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { nanoid } from 'nanoid';
import { isNewerAnchor, initialVideoState } from './sync-math';
import type {
  ClientRoomState,
  ClientMemberInfo,
  ClientQueueItem,
  QueueBroadcastItem,
  ChatMessage,
  SystemMessage,
  ChatEntry,
  RoomAction,
  VideoState,
  RoomHistoryEntry,
} from './types';

/** Turn a broadcast queue into this viewer's queue (see `QueueBroadcastItem`). */
function adoptQueue(items: QueueBroadcastItem[], myUserId: string): ClientQueueItem[] {
  return items.map(({ voters, ...item }) => ({ ...item, votedByMe: voters.includes(myUserId) }));
}

// ─── User Settings ───────────────────────────────────────────────

/**
 * Every field here is read by something. It used to carry eight more —
 * `showChat`, `chatPosition`, `autoFullscreen`, `desktopNotifications`,
 * `notifyOnMention`, `notifyOnAllMessages`, `soundEffects`, `soundVolume` —
 * that were persisted to every viewer's browser and read by no code at all.
 * A preference that does nothing is worse than a missing one: it is a promise
 * the app breaks every time you set it. They are gone, and `SETTINGS_KEYS`
 * below strips them back out of blobs that were saved before they were.
 */
export interface RmhTubeUserSettings {
  // Playback — local to this viewer, never synced to the room.
  masterVolume: number;
  muted: boolean;
  captionsEnabled: boolean;

  // Appearance
  theme: 'dark' | 'light' | 'high-contrast';
  layoutDensity: 'compact' | 'comfortable' | 'spacious';
  theaterMode: boolean;

  // Chat
  showTimestamps: boolean;
  showSystemMessages: boolean;

  // Rooms
  roomHistory: RoomHistoryEntry[];
  favoriteRooms: string[];
  hasSeenTour: boolean;
}

const DEFAULT_SETTINGS: RmhTubeUserSettings = {
  masterVolume: 0.7,
  muted: false,
  captionsEnabled: false,
  theme: 'dark',
  layoutDensity: 'comfortable',
  theaterMode: false,
  showTimestamps: true,
  showSystemMessages: true,
  roomHistory: [],
  favoriteRooms: [],
  hasSeenTour: false,
};

const SETTINGS_KEYS = Object.keys(DEFAULT_SETTINGS) as (keyof RmhTubeUserSettings)[];

/**
 * Rebuild a settings object from a persisted blob, keeping only keys that still
 * exist. Without the filter, a browser that stored the retired keys carries
 * them forward forever.
 */
function sanitizeSettings(raw: unknown): RmhTubeUserSettings {
  const source = (raw ?? {}) as Partial<RmhTubeUserSettings>;
  const next = { ...DEFAULT_SETTINGS };
  for (const key of SETTINGS_KEYS) {
    const value = source[key];
    if (value !== undefined && typeof value === typeof DEFAULT_SETTINGS[key]) {
      (next as Record<string, unknown>)[key] = value;
    }
  }
  return next;
}

/**
 * Chat messages retained client-side. A watch party can run for hours, so this
 * is the ceiling on scrollback rather than a page size — deeper history lives
 * server-side.
 */
const CHAT_SCROLLBACK = 200;

// ─── Store Interface ─────────────────────────────────────────────

export interface RmhTubeStore {
  connectionStatus: RealtimeStatus;
  /** Peers the room is buffering-paused on, or null when nobody is waited for. */
  peersWaiting: PeerWaitState | null;
  room: ClientRoomState | null;
  lastSeq: number;
  settings: RmhTubeUserSettings;
  systemMessages: SystemMessage[];

  setConnectionStatus: (status: RmhTubeStore['connectionStatus']) => void;
  setPeersWaiting: (waiting: PeerWaitState | null) => void;
  applyAction: (action: RoomAction) => void;
  applyFullSync: (fullState: ClientRoomState) => void;
  /** Apply an anchor from the server, dropping any that arrives out of order. */
  applyVideoState: (videoState: VideoState) => void;
  /** Apply a local optimistic anchor (the leader acting on its own player). */
  setVideoState: (videoState: VideoState) => void;
  updateSettings: (partial: Partial<RmhTubeUserSettings>) => void;
  addSystemMessage: (event: SystemMessage['event'], content: string) => void;
  leaveRoom: () => void;
  reset: () => void;
  addRoomToHistory: (entry: RoomHistoryEntry) => void;
  removeRoomFromHistory: (roomId: string) => void;
  toggleFavoriteRoom: (roomId: string) => void;
}

// ─── Store Implementation ────────────────────────────────────────

export const useRmhTubeStore = create<RmhTubeStore>()(
  persist(
    (set, get) => ({
      connectionStatus: 'idle',
      peersWaiting: null,
      room: null,
      lastSeq: -1,
      settings: { ...DEFAULT_SETTINGS },
      systemMessages: [],

      setConnectionStatus: (status) => set({ connectionStatus: status }),
      setPeersWaiting: (waiting) => set({ peersWaiting: waiting }),

      applyAction: (action) => {
        const state = get();
        if (action.seq <= state.lastSeq) return;

        const updatedRoom = state.room
          ? applyRoomAction(state.room, action, state)
          : state.room;

        set({ room: updatedRoom, lastSeq: action.seq });
      },

      applyFullSync: (fullState) => {
        set({ room: fullState, lastSeq: fullState.seq, systemMessages: [] });
      },

      applyVideoState: (videoState) => {
        set((state) => {
          if (!state.room) return {};
          if (!isNewerAnchor(state.room.videoState, videoState)) return {};
          return { room: { ...state.room, videoState } };
        });
      },

      setVideoState: (videoState) => {
        set((state) => (state.room ? { room: { ...state.room, videoState } } : {}));
      },

      updateSettings: (partial) => {
        set((state) => ({ settings: { ...state.settings, ...partial } }));
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

      leaveRoom: () => set({ room: null, lastSeq: -1, systemMessages: [], peersWaiting: null }),

      reset: () => set({
        connectionStatus: 'disconnected',
        peersWaiting: null,
        room: null,
        lastSeq: -1,
        systemMessages: [],
      }),

      addRoomToHistory: (entry) => {
        set((state) => {
          const history = state.settings.roomHistory.filter((r) => r.roomId !== entry.roomId);
          history.unshift(entry);
          return {
            settings: { ...state.settings, roomHistory: history.slice(0, 20) },
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
          return { settings: { ...state.settings, favoriteRooms: next } };
        });
      },
    }),
    {
      name: 'rmhtube-settings',
      partialize: (state) => ({ settings: state.settings }),
      merge: (persisted, current) => {
        const p = persisted as { settings?: unknown } | undefined;
        return {
          ...(current as RmhTubeStore),
          settings: sanitizeSettings(p?.settings),
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
    case 'MEMBER_JOINED': {
      const userId = data.userId as string;
      // A rejoin broadcasts this again, and the list is keyed by userId
      // everywhere else — a duplicate entry shows the same person twice and
      // inflates the vote-skip threshold they are counted against.
      const existing = room.members.find((m) => m.userId === userId);
      store?.addSystemMessage('join', `${data.userName} joined the room`);
      const member: ClientMemberInfo = {
        userId,
        userName: data.userName as string,
        avatarUrl: (data.avatarUrl as string | null) ?? null,
        isConnected: true,
        isHost: userId === room.hostUserId,
        isLeader: userId === room.leaderUserId,
        role: existing?.role ?? 'member',
        status: 'watching',
      };
      return {
        ...room,
        members: existing
          ? room.members.map((m) => (m.userId === userId ? member : m))
          : [...room.members, member],
      };
    }

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
        // Bounded scrollback, matching the `systemMessages.slice(-100)` cap this
        // store already applies. This array was the one unbounded structure in a
        // long-lived watch party: it grew for the room's entire lifetime, and
        // because `getChatEntries` merges and re-sorts it on every store change,
        // and ChatPanel renders every entry, an all-evening room paid for its
        // whole history on each new message — in memory, in sort cost, and in DOM
        // nodes. Older messages remain server-side history.
        chat: [
          ...room.chat.slice(1 - CHAT_SCROLLBACK),
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
        queue: [...room.queue, ...adoptQueue([data.item as QueueBroadcastItem], room.myUserId)],
      };

    case 'QUEUE_ITEM_REMOVED':
      return {
        ...room,
        queue: room.queue.filter((q) => q.id !== data.itemId),
        // Removing an item above the playhead shifts it. The server sends the
        // corrected index; without it the pointer silently drifted and the next
        // skip replayed or skipped a video.
        currentIndex: (data.currentIndex as number) ?? room.currentIndex,
      };

    case 'QUEUE_REORDERED':
      return {
        ...room,
        queue: adoptQueue(data.queue as QueueBroadcastItem[], room.myUserId),
        currentIndex: (data.currentIndex as number) ?? room.currentIndex,
      };

    case 'QUEUE_ITEM_META': {
      const itemId = data.itemId as string;
      const patch = {
        ...(data.duration !== undefined ? { duration: data.duration as number | null } : {}),
        ...(data.live !== undefined ? { live: data.live as boolean } : {}),
        ...(data.title !== undefined ? { title: data.title as string } : {}),
      };
      return {
        ...room,
        queue: room.queue.map((q) => (q.id === itemId ? { ...q, ...patch } : q)),
        currentItem:
          room.currentItem?.id === itemId
            ? { ...room.currentItem, ...patch }
            : room.currentItem,
      };
    }

    case 'NOW_PLAYING': {
      const prevItem = room.currentItem;
      const broadcast = data.item as QueueBroadcastItem | null;
      const item = broadcast ? adoptQueue([broadcast], room.myUserId)[0] : null;
      store?.addSystemMessage('now_playing', `Now playing: ${item?.title ?? 'Unknown'}`);
      return {
        ...room,
        currentItem: item,
        currentIndex: data.index as number,
        // The server stamps the fresh anchor; adopting it verbatim (rather than
        // minting one on the local clock) keeps the whole room on one time base
        // from the item's very first frame.
        videoState: data.videoState as VideoState,
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
        videoState: (data.videoState as VideoState) ?? initialVideoState(Date.now()),
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

    case 'QUEUE_HISTORY_UPDATED':
      return {
        ...room,
        playedItems: adoptQueue(data.playedItems as QueueBroadcastItem[], room.myUserId),
      };

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

/**
 * Merge chat and system messages into one time-ordered list.
 *
 * Takes the two arrays rather than the whole store so a caller can memoise on
 * exactly what this reads. `useRmhTubeStore()` subscribes to the entire store,
 * which changes on every anchor and clock sync, so a store-keyed memo re-merged
 * and re-sorted the whole transcript on updates unrelated to chat.
 */
export function getChatEntries(
  chat: ChatEntry[] | undefined,
  systemMessages: ChatEntry[],
): ChatEntry[] {
  return [...(chat ?? []), ...systemMessages].sort((a, b) => a.createdAt - b.createdAt);
}
