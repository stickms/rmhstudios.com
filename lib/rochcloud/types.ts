// ─── SoundCloud Track ───────────────────────────────────────────

export interface SCTrack {
  id: number;
  title: string;
  artist: string;
  artworkUrl: string | null;
  durationMs: number;
  streamUrl: string | null;
  permalink: string;
  waveformUrl: string | null;
  genre: string | null;
  playbackCount: number;
  likesCount: number;
}

// ─── SoundCloud Playlist ────────────────────────────────────────

export interface SCPlaylist {
  id: number;
  title: string;
  artworkUrl: string | null;
  trackCount: number;
  durationMs: number;
  permalink: string;
  isAlbum: boolean;
  createdAt: string;
  tracks: SCTrack[];
}

// ─── SoundCloud User ────────────────────────────────────────────

export interface SCUser {
  id: number;
  username: string;
  avatarUrl: string | null;
  fullName: string | null;
  followersCount: number;
  followingsCount: number;
  trackCount: number;
  playlistCount: number;
  likesCount: number;
}

// ─── Auth State ─────────────────────────────────────────────────

export interface SCAuthState {
  isConnected: boolean;
  accessToken: string | null;
  user: SCUser | null;
  expiresAt: number | null;
}

// ─── Playback State ─────────────────────────────────────────────

export interface SCPlaybackState {
  isPlaying: boolean;
  currentTrack: SCTrack | null;
  positionMs: number;
  durationMs: number;
  updatedAt: number;
}

// ─── Library Tab ────────────────────────────────────────────────

export type LibraryTab = 'likes' | 'playlists' | 'history';

// ─── View State ─────────────────────────────────────────────────

export type RochCloudView =
  | { type: 'home' }
  | { type: 'search' }
  | { type: 'library' }
  | { type: 'playlist'; playlistId: number }
  | { type: 'queue' };
