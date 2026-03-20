import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { SCTrack, SCPlaylist, SCUser, SCPlaybackState, SCAuthState, LibraryTab, RochCloudView } from './types';

export interface RochCloudSettings {
  volume: number;
  muted: boolean;
  repeat: 'off' | 'all' | 'one';
  shuffle: boolean;
}

const DEFAULT_SETTINGS: RochCloudSettings = {
  volume: 0.8,
  muted: false,
  repeat: 'off',
  shuffle: false,
};

export interface RochCloudStore {
  // Auth
  auth: SCAuthState;
  setAuth: (auth: Partial<SCAuthState>) => void;
  logout: () => void;

  // View
  view: RochCloudView;
  setView: (view: RochCloudView) => void;

  // Playback
  playback: SCPlaybackState;
  queue: SCTrack[];
  queueIndex: number;
  history: SCTrack[];
  setPlayback: (state: Partial<SCPlaybackState>) => void;
  setCurrentTrack: (track: SCTrack | null) => void;
  addToQueue: (track: SCTrack) => void;
  addToQueueNext: (track: SCTrack) => void;
  removeFromQueue: (index: number) => void;
  clearQueue: () => void;
  playQueue: (index: number) => void;
  setQueueFromTracks: (tracks: SCTrack[], startIndex?: number) => void;

  // Search
  searchQuery: string;
  searchResults: SCTrack[];
  searchPlaylistResults: SCPlaylist[];
  searchLoading: boolean;
  setSearchQuery: (q: string) => void;
  setSearchResults: (tracks: SCTrack[]) => void;
  setSearchPlaylistResults: (playlists: SCPlaylist[]) => void;
  setSearchLoading: (loading: boolean) => void;

  // Library
  libraryTab: LibraryTab;
  likedTracks: SCTrack[];
  likedTracksOffset: number | null;
  likedTracksLoading: boolean;
  playlists: SCPlaylist[];
  playlistsLoading: boolean;
  currentPlaylist: SCPlaylist | null;
  setLibraryTab: (tab: LibraryTab) => void;
  setLikedTracks: (tracks: SCTrack[], nextOffset: number | null) => void;
  appendLikedTracks: (tracks: SCTrack[], nextOffset: number | null) => void;
  setLikedTracksLoading: (loading: boolean) => void;
  setPlaylists: (playlists: SCPlaylist[]) => void;
  setPlaylistsLoading: (loading: boolean) => void;
  setCurrentPlaylist: (playlist: SCPlaylist | null) => void;

  // Settings
  settings: RochCloudSettings;
  updateSettings: (partial: Partial<RochCloudSettings>) => void;
}

export const useRochCloudStore = create<RochCloudStore>()(
  persist(
    (set, get) => ({
      // Auth
      auth: { isConnected: false, accessToken: null, user: null, expiresAt: null },
      setAuth: (auth) => set((s) => ({ auth: { ...s.auth, ...auth } })),
      logout: () => set({
        auth: { isConnected: false, accessToken: null, user: null, expiresAt: null },
        likedTracks: [],
        likedTracksOffset: null,
        playlists: [],
        currentPlaylist: null,
        history: [],
      }),

      // View
      view: { type: 'home' },
      setView: (view) => set({ view }),

      // Playback
      playback: { isPlaying: false, currentTrack: null, positionMs: 0, durationMs: 0, updatedAt: 0 },
      queue: [],
      queueIndex: -1,
      history: [],
      setPlayback: (state) => set((s) => ({ playback: { ...s.playback, ...state } })),
      setCurrentTrack: (track) => set((s) => ({
        playback: { ...s.playback, currentTrack: track, positionMs: 0, updatedAt: Date.now() },
        history: track ? [track, ...s.history.filter((t) => t.id !== track.id)].slice(0, 50) : s.history,
      })),
      addToQueue: (track) => set((s) => ({ queue: [...s.queue, track] })),
      addToQueueNext: (track) => set((s) => {
        const idx = s.queueIndex + 1;
        const q = [...s.queue];
        q.splice(idx, 0, track);
        return { queue: q };
      }),
      removeFromQueue: (index) => set((s) => {
        const q = [...s.queue];
        q.splice(index, 1);
        const newIdx = index < s.queueIndex ? s.queueIndex - 1 : s.queueIndex;
        return { queue: q, queueIndex: Math.min(newIdx, q.length - 1) };
      }),
      clearQueue: () => set({ queue: [], queueIndex: -1 }),
      playQueue: (index) => set((s) => {
        const track = s.queue[index];
        if (!track) return {};
        return {
          queueIndex: index,
          playback: { ...s.playback, currentTrack: track, positionMs: 0, isPlaying: true, updatedAt: Date.now() },
          history: [track, ...s.history.filter((t) => t.id !== track.id)].slice(0, 50),
        };
      }),
      setQueueFromTracks: (tracks, startIndex = 0) => set((s) => {
        const track = tracks[startIndex];
        return {
          queue: tracks,
          queueIndex: startIndex,
          playback: { ...s.playback, currentTrack: track ?? null, positionMs: 0, isPlaying: true, updatedAt: Date.now() },
          history: track ? [track, ...s.history.filter((t) => t.id !== track.id)].slice(0, 50) : s.history,
        };
      }),

      // Search
      searchQuery: '',
      searchResults: [],
      searchPlaylistResults: [],
      searchLoading: false,
      setSearchQuery: (q) => set({ searchQuery: q }),
      setSearchResults: (tracks) => set({ searchResults: tracks }),
      setSearchPlaylistResults: (playlists) => set({ searchPlaylistResults: playlists }),
      setSearchLoading: (loading) => set({ searchLoading: loading }),

      // Library
      libraryTab: 'likes',
      likedTracks: [],
      likedTracksOffset: null,
      likedTracksLoading: false,
      playlists: [],
      playlistsLoading: false,
      currentPlaylist: null,
      setLibraryTab: (tab) => set({ libraryTab: tab }),
      setLikedTracks: (tracks, nextOffset) => set({ likedTracks: tracks, likedTracksOffset: nextOffset }),
      appendLikedTracks: (tracks, nextOffset) => set((s) => ({
        likedTracks: [...s.likedTracks, ...tracks],
        likedTracksOffset: nextOffset,
      })),
      setLikedTracksLoading: (loading) => set({ likedTracksLoading: loading }),
      setPlaylists: (playlists) => set({ playlists }),
      setPlaylistsLoading: (loading) => set({ playlistsLoading: loading }),
      setCurrentPlaylist: (playlist) => set({ currentPlaylist: playlist }),

      // Settings
      settings: { ...DEFAULT_SETTINGS },
      updateSettings: (partial) => set((s) => ({ settings: { ...s.settings, ...partial } })),
    }),
    {
      name: 'rochcloud-state',
      partialize: (state) => ({
        auth: state.auth,
        settings: state.settings,
        history: state.history,
      }),
      merge: (persisted, current) => {
        const p = persisted as any;
        return {
          ...(current as RochCloudStore),
          auth: { ...current.auth, ...(p?.auth ?? {}) },
          settings: { ...DEFAULT_SETTINGS, ...(p?.settings ?? {}) },
          history: p?.history ?? [],
        };
      },
    },
  ),
);
