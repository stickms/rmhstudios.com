/**
 * RmhTube — Shared Type Definitions
 *
 * Types shared between the client and server.
 * Server-only types are in server/rmhtube/types.ts.
 */

// ─── Media Types ─────────────────────────────────────────────────

export type MediaType = 'youtube' | 'twitch' | 'direct';

// ─── Room Settings ───────────────────────────────────────────────

export interface RoomSettings {
  isPublic: boolean;
  maxMembers: number;
  allowMemberQueue: boolean;
  allowMemberSkip: boolean;
  autoPlay: boolean;
  password: string | null;
}

// ─── Video State (ephemeral — not persisted) ─────────────────────

export interface VideoState {
  playing: boolean;
  currentTime: number;
  playbackRate: number;
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

// ─── Client-Side State ───────────────────────────────────────────

export interface ClientRoomState {
  roomId: string;
  name: string | null;
  hostUserId: string;
  settings: RoomSettings;
  members: ClientMemberInfo[];
  queue: ClientQueueItem[];
  currentItem: ClientQueueItem | null;
  currentIndex: number;
  videoState: VideoState;
  chat: ChatMessage[];
  skipVotes: string[];
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
  url: string;
  mediaType: MediaType;
  title: string;
  duration: number | null;
  thumbnailUrl: string | null;
  addedBy: string;
  addedByName: string;
  addedAt: number;
  position: number;
}

// ─── Public Room Info (for room browser) ─────────────────────────

export interface PublicRoomInfo {
  roomId: string;
  name: string | null;
  hostName: string;
  memberCount: number;
  maxMembers: number;
  currentVideo: string | null;
  hasPassword: boolean;
}

// ─── Room Actions (incremental state updates) ────────────────────

export interface RoomAction {
  type: string;
  payload: unknown;
  seq: number;
  timestamp: number;
}

// ─── Errors ──────────────────────────────────────────────────────

export type RmhTubeErrorCode =
  | 'AUTH_REQUIRED'
  | 'AUTH_FAILED'
  | 'SESSION_EXPIRED'
  | 'ROOM_NOT_FOUND'
  | 'ROOM_FULL'
  | 'WRONG_PASSWORD'
  | 'NOT_HOST'
  | 'NOT_IN_ROOM'
  | 'ALREADY_IN_ROOM'
  | 'INVALID_PAYLOAD'
  | 'INVALID_URL'
  | 'QUEUE_FULL'
  | 'INTERNAL_ERROR'
  | 'RATE_LIMITED';

export interface RmhTubeError {
  code: RmhTubeErrorCode;
  message: string;
}
