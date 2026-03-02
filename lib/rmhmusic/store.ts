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

export interface RmhMusicStore {
  connectionStatus: 'disconnected' | 'connecting' | 'connected' | 'error';
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

  setConnectionStatus: (status: RmhMusicStore['connectionStatus']) => void;
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

  addRoomToHistory: (entry: RoomHistoryEntry) => void;
}

export const useRmhMusicStore = create<RmhMusicStore>()(
  persist(
    (set, get) => ({
      connectionStatus: 'disconnected',
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

      setConnectionStatus: (status) => set({ connectionStatus: status }),

      applyAction: (action) => {
        const state = get();
        if (action.seq <= state.lastSeq) return;
        const updatedRoom = state.room ? applyRoomAction(state.room, action, state) : null;
        set({ room: updatedRoom, lastSeq: action.seq });
      },

      applyFullSync: (fullState) => set({ room: fullState, lastSeq: fullState.seq, systemMessages: [] }),

      updateSettings: (partial) => set((s) => ({ settings: { ...s.settings, ...partial } })),

      addSystemMessage: (event, content) => {
        const msg: SystemMessage = { id: `sys-${nanoid(8)}`, type: 'system', event, content, createdAt: Date.now() };
        set((s) => ({ systemMessages: [...s.systemMessages.slice(-100), msg] }));
      },

      leaveRoom: () => set({ room: null, lastSeq: -1, systemMessages: [] }),
      reset: () => set({ connectionStatus: 'disconnected', room: null, lastSeq: -1, systemMessages: [] }),

      setSpotify: (state) => set((s) => ({ spotify: { ...s.spotify, ...state } })),
      setCurrentTrack: (track) => set({ currentTrack: track }),
      setPlayback: (state) => set((s) => ({ playback: { ...s.playback, ...state } })),
      setSearchResults: (results) => set({ searchResults: results }),
      setSearchQuery: (query) => set({ searchQuery: query }),
      setSearchOpen: (open) => set({ isSearchOpen: open }),
      setChatOpen: (open) => set({ isChatOpen: open }),

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
        return { ...(current as RmhMusicStore), settings: { ...DEFAULT_SETTINGS, ...(p?.settings ?? {}) } };
      },
    },
  ),
);

function applyRoomAction(room: ClientRoomState, action: RoomAction, store: RmhMusicStore): ClientRoomState {
  const { type, payload } = action;
  const data = (payload ?? {}) as Record<string, unknown>;

  switch (type) {
    case 'MEMBER_JOINED':
      store.addSystemMessage('join', `${data.userName} joined`);
      return { ...room, members: [...room.members, { userId: data.userId as string, userName: data.userName as string, avatarUrl: (data.avatarUrl as string | null) ?? null, isConnected: true, isHost: false }] };

    case 'MEMBER_LEFT':
      store.addSystemMessage('leave', `${room.members.find((m) => m.userId === data.userId)?.userName ?? 'Someone'} left`);
      return { ...room, members: room.members.filter((m) => m.userId !== data.userId) };

    case 'HOST_TRANSFERRED':
      store.addSystemMessage('host_transfer', `${data.newHostUserName} is now the host`);
      return { ...room, hostUserId: data.newHostUserId as string, members: room.members.map((m) => ({ ...m, isHost: m.userId === data.newHostUserId })) };

    case 'CHAT_MESSAGE':
      return { ...room, chat: [...room.chat, data as unknown as ChatMessage] };

    case 'QUEUE_ITEM_ADDED':
      return { ...room, queue: [...room.queue, data.item as ClientQueueItem] };

    case 'NOW_PLAYING':
      store.addSystemMessage('now_playing', `Now playing: ${(data.track as TrackInfo)?.title ?? 'Unknown'}`);
      return { ...room, currentTrack: (data.track as TrackInfo) ?? null };

    case 'MEMBER_DISCONNECTED':
      return { ...room, members: room.members.map((m) => m.userId === data.userId ? { ...m, isConnected: false } : m) };

    default:
      return room;
  }
}

export function getChatEntries(store: RmhMusicStore): ChatEntry[] {
  const messages: ChatEntry[] = store.room?.chat ?? [];
  const system: ChatEntry[] = store.systemMessages;
  return [...messages, ...system].sort((a, b) => a.createdAt - b.createdAt);
}
