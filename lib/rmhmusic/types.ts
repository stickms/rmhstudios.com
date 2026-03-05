// ─── Room Settings ───────────────────────────────────────────────

export interface RoomSettings {
  isPublic: boolean;
  maxMembers: number;
  password: string | null;
}

// ─── Playback State (ephemeral) ──────────────────────────────────

export interface PlaybackState {
  trackUri: string | null;
  positionMs: number;
  isPlaying: boolean;
  updatedAt: number;
}

// ─── Chat ────────────────────────────────────────────────────────

export interface ChatMessage {
  id: string;
  userId: string;
  userName: string;
  content: string;
  createdAt: number;
}

export interface SystemMessage {
  id: string;
  type: 'system';
  event: 'join' | 'leave' | 'host_transfer' | 'now_playing';
  content: string;
  createdAt: number;
}

export type ChatEntry = ChatMessage | SystemMessage;

// ─── Track Info ──────────────────────────────────────────────────

export interface TrackInfo {
  spotifyUri: string;
  title: string;
  artist: string;
  albumArt: string;
  durationMs: number;
  previewUrl: string | null;
}

// ─── Client-Side State ───────────────────────────────────────────

export interface ClientRoomState {
  roomId: string;
  code: string;
  name: string;
  hostUserId: string;
  settings: RoomSettings;
  members: ClientMemberInfo[];
  queue: ClientQueueItem[];
  currentTrack: TrackInfo | null;
  playback: PlaybackState;
  chat: ChatMessage[];
  myUserId: string;
  seq: number;
}

export interface ClientMemberInfo {
  userId: string;
  userName: string;
  avatarUrl: string | null;
  isConnected: boolean;
  isHost: boolean;
}

export interface ClientQueueItem {
  id: string;
  spotifyUri: string;
  title: string;
  artist: string;
  albumArt: string;
  durationMs: number;
  previewUrl: string | null;
  addedBy: string;
  addedByName: string;
  addedAt: number;
  position: number;
}

// ─── Public Room Info (for browser) ──────────────────────────────

export interface PublicRoomInfo {
  roomId: string;
  code: string;
  name: string;
  hostName: string;
  memberCount: number;
  maxMembers: number;
  currentTrack: string | null;
  hasPassword: boolean;
}

// ─── Room History ────────────────────────────────────────────────

export interface RoomHistoryEntry {
  roomId: string;
  roomName: string;
  code: string;
  lastVisited: number;
}

// ─── Room Actions (incremental state updates) ────────────────────

export interface RoomAction {
  type: string;
  payload: unknown;
  seq: number;
  timestamp: number;
}

// ─── Spotify Auth State ──────────────────────────────────────────

export interface SpotifyAuthState {
  isConnected: boolean;
  deviceId: string | null;
  isPremium: boolean;
}

// ─── Errors ──────────────────────────────────────────────────────

export type RmhMusicErrorCode =
  | 'AUTH_REQUIRED'
  | 'SPOTIFY_NOT_CONNECTED'
  | 'ROOM_NOT_FOUND'
  | 'ROOM_FULL'
  | 'WRONG_PASSWORD'
  | 'NOT_HOST'
  | 'NOT_IN_ROOM'
  | 'ALREADY_IN_ROOM'
  | 'INVALID_PAYLOAD'
  | 'QUEUE_FULL'
  | 'INTERNAL_ERROR'
  | 'RATE_LIMITED';
