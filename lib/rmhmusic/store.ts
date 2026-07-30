import type { RealtimeStatus, PeerWaitState } from '@/lib/shared/realtime/types';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { nanoid } from 'nanoid';
import type {
  ClientRoomState,
  ClientQueueItem,
  ChatMessage,
  SystemMessage,
  ChatEntry,
  RoomAction,
  PlaybackState,
  SpotifyAuthState,
  TrackInfo,
  RoomHistoryEntry,
} from './types';

export interface RmhMusicSettings {
  volume: number;
  muted: boolean;
  roomHistory: RoomHistoryEntry[];
}

const DEFAULT_SETTINGS: RmhMusicSettings = {
  volume: 0.7,
  muted: false,
  roomHistory: [],
};

/**
 * Chat messages retained client-side, mirroring the RMHTube store's cap. A ceiling
 * on scrollback for a long-running room, not a page size — deeper history is
 * server-side.
 */
const CHAT_SCROLLBACK = 200;

export interface RmhMusicStore {
  connectionStatus: RealtimeStatus;
  /** Peers the room is paused on, or null when nobody is being waited for. */
  peersWaiting: PeerWaitState | null;
  room: ClientRoomState | null;
  lastSeq: number;
  settings: RmhMusicSettings;
  systemMessages: SystemMessage[];

  spotify: SpotifyAuthState;
  currentTrack: TrackInfo | null;
  playback: PlaybackState;
  searchResults: any[];
  searchQuery: string;
  isSearchOpen: boolean;
  isChatOpen: boolean;
  isGuessOpen: boolean;

  setConnectionStatus: (status: RmhMusicStore['connectionStatus']) => void;
  setPeersWaiting: (waiting: PeerWaitState | null) => void;
  applyAction: (action: RoomAction) => void;
  applyFullSync: (fullState: ClientRoomState) => void;
  updateSettings: (partial: Partial<RmhMusicSettings>) => void;
  addSystemMessage: (event: SystemMessage['event'], content: string) => void;
  leaveRoom: () => void;
  reset: () => void;

  setSpotify: (state: Partial<SpotifyAuthState>) => void;
  setCurrentTrack: (track: TrackInfo | null) => void;
  setPlayback: (state: Partial<PlaybackState>) => void;
  setSearchResults: (results: any[]) => void;
  setSearchQuery: (query: string) => void;
  setSearchOpen: (open: boolean) => void;
  setChatOpen: (open: boolean) => void;
  setGuessOpen: (open: boolean) => void;

  addRoomToHistory: (entry: RoomHistoryEntry) => void;
}

export const useRmhMusicStore = create<RmhMusicStore>()(
  persist(
    (set, get) => ({
      connectionStatus: 'idle',
      peersWaiting: null,
      room: null,
      lastSeq: -1,
      settings: { ...DEFAULT_SETTINGS },
      systemMessages: [],

      spotify: { isConnected: false, deviceId: null, isPremium: false },
      currentTrack: null,
      playback: { trackUri: null, positionMs: 0, isPlaying: false, updatedAt: 0 },
      searchResults: [],
      searchQuery: '',
      isSearchOpen: false,
      isChatOpen: false,
      isGuessOpen: false,

      setConnectionStatus: (status) => set({ connectionStatus: status }),
      setPeersWaiting: (waiting) => set({ peersWaiting: waiting }),

      applyAction: (action) => {
        const state = get();
        if (action.seq <= state.lastSeq) return;
        const updatedRoom = state.room ? applyRoomAction(state.room, action, state) : null;
        set({ room: updatedRoom, lastSeq: action.seq });
      },

      applyFullSync: (fullState) =>
        set({ room: fullState, lastSeq: fullState.seq, systemMessages: [] }),

      updateSettings: (partial) => set((s) => ({ settings: { ...s.settings, ...partial } })),

      addSystemMessage: (event, content) => {
        const msg: SystemMessage = {
          id: `sys-${nanoid(8)}`,
          type: 'system',
          event,
          content,
          createdAt: Date.now(),
        };
        set((s) => ({ systemMessages: [...s.systemMessages.slice(-100), msg] }));
      },

      leaveRoom: () => set({ room: null, lastSeq: -1, systemMessages: [] }),
      reset: () =>
        set({
          connectionStatus: 'disconnected',
          peersWaiting: null,
          room: null,
          lastSeq: -1,
          systemMessages: [],
        }),

      setSpotify: (state) => set((s) => ({ spotify: { ...s.spotify, ...state } })),
      setCurrentTrack: (track) => set({ currentTrack: track }),
      setPlayback: (state) => set((s) => ({ playback: { ...s.playback, ...state } })),
      setSearchResults: (results) => set({ searchResults: results }),
      setSearchQuery: (query) => set({ searchQuery: query }),
      setSearchOpen: (open) => set({ isSearchOpen: open }),
      setChatOpen: (open) => set({ isChatOpen: open }),
      setGuessOpen: (open) => set({ isGuessOpen: open }),

      addRoomToHistory: (entry) => {
        set((s) => {
          const history = s.settings.roomHistory.filter((r) => r.roomId !== entry.roomId);
          history.unshift(entry);
          return { settings: { ...s.settings, roomHistory: history.slice(0, 20) } };
        });
      },
    }),
    {
      name: 'rmhmusic-settings',
      partialize: (state) => ({ settings: state.settings }),
      merge: (persisted, current) => {
        const p = persisted as { settings?: Partial<RmhMusicSettings> } | undefined;
        return {
          ...(current as RmhMusicStore),
          settings: { ...DEFAULT_SETTINGS, ...(p?.settings ?? {}) },
        };
      },
    },
  ),
);

function applyRoomAction(
  room: ClientRoomState,
  action: RoomAction,
  store: RmhMusicStore,
): ClientRoomState {
  const { type, payload } = action;
  const data = (payload ?? {}) as Record<string, unknown>;

  switch (type) {
    case 'MEMBER_JOINED':
      store.addSystemMessage('join', `${data.userName} joined`);
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
      store.addSystemMessage(
        'leave',
        `${room.members.find((m) => m.userId === data.userId)?.userName ?? 'Someone'} left`,
      );
      return { ...room, members: room.members.filter((m) => m.userId !== data.userId) };

    case 'HOST_TRANSFERRED':
      store.addSystemMessage('host_transfer', `${data.newHostUserName} is now the host`);
      return {
        ...room,
        hostUserId: data.newHostUserId as string,
        members: room.members.map((m) => ({ ...m, isHost: m.userId === data.newHostUserId })),
      };

    case 'CHAT_MESSAGE':
      // Bounded scrollback, matching the `systemMessages.slice(-100)` cap below.
      // A listening room can run for hours and this array was the one structure
      // that grew for its whole lifetime, re-sorted and re-rendered on every new
      // message. Deeper history stays server-side.
      return {
        ...room,
        chat: [...room.chat.slice(1 - CHAT_SCROLLBACK), data as unknown as ChatMessage],
      };

    case 'QUEUE_ITEM_ADDED':
      return { ...room, queue: [...room.queue, data.item as ClientQueueItem] };

    case 'NOW_PLAYING':
      store.addSystemMessage(
        'now_playing',
        `Now playing: ${(data.track as TrackInfo)?.title ?? 'Unknown'}`,
      );
      return { ...room, currentTrack: (data.track as TrackInfo) ?? null };

    case 'MEMBER_DISCONNECTED':
      return {
        ...room,
        members: room.members.map((m) =>
          m.userId === data.userId ? { ...m, isConnected: false } : m,
        ),
      };

    default:
      return room;
  }
}

/**
 * Merge chat and system messages into one time-ordered list. Takes the two arrays
 * rather than the whole store so the caller can memoise on exactly what this
 * reads — the store object itself changes on unrelated playback updates.
 */
export function getChatEntries(
  chat: ChatEntry[] | undefined,
  systemMessages: ChatEntry[],
): ChatEntry[] {
  return [...(chat ?? []), ...systemMessages].sort((a, b) => a.createdAt - b.createdAt);
}
