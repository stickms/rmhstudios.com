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
  // Phase 3
  queueVoting: boolean;
  autoSortByVotes: boolean;
  loopQueue: boolean;
  // Phase 5
  customReactions: string[] | null;
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
  // Phase 1: Message Replies
  replyToId: string | null;
  replyToContent: string | null;
  replyToUserName: string | null;
  // Phase 1: @Mentions
  mentions: string[];
  // Phase 1: Chat Reactions
  reactions: Record<string, string[]>;
  // Phase 2: Timestamp Sharing
  timestamp: number | null;
}

// Phase 1: System Messages
export interface SystemMessage {
  id: string;
  type: 'system';
  event: 'join' | 'leave' | 'kick' | 'host_transfer' | 'leader_change' | 'skip' | 'settings_change' | 'now_playing';
  content: string;
  createdAt: number;
}

export type ChatEntry = ChatMessage | SystemMessage;

// ─── Client-Side State ───────────────────────────────────────────

export interface ClientRoomState {
  roomId: string;
  name: string | null;
  hostUserId: string;
  leaderUserId: string;
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
  // Phase 1: Typing Indicators
  typingUsers: string[];
  // Phase 1: Pinned Messages
  pinnedMessage: ChatMessage | null;
  // Phase 3: Queue History
  playedItems: ClientQueueItem[];
  // Phase 4: Ban List (host/mod only)
  bannedUsers: BannedUser[];
}

export type UserPresenceStatus = 'watching' | 'afk' | 'brb';
export type MemberRole = 'host' | 'member';

export interface ClientMemberInfo {
  userId: string;
  userName: string;
  avatarUrl: string | null;
  isConnected: boolean;
  isHost: boolean;
  isLeader: boolean;
  role: MemberRole;
  // Phase 4: User Presence Status
  status: UserPresenceStatus;
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
  // Phase 3: Queue Voting
  votes: number;
  votedByMe: boolean;
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
  // Phase 4: Room Scheduling
  scheduledFor: number | null;
}

// ─── Ban List (Phase 4) ──────────────────────────────────────────

export interface BannedUser {
  userId: string;
  userName: string;
  bannedAt: number;
  bannedBy: string;
  reason: string | null;
}

// ─── Invite Links (Phase 4) ─────────────────────────────────────

export interface InviteLink {
  code: string;
  roomId: string;
  createdBy: string;
  expiresAt: number;
  maxUses: number;
  useCount: number;
}

// ─── Room History (Phase 4) ──────────────────────────────────────

export interface RoomHistoryEntry {
  roomId: string;
  roomName: string | null;
  hostName: string;
  lastVisited: number;
  videoCount: number;
}

export interface RoomHistoryStatus {
  roomId: string;
  isOpen: boolean;
  memberCount: number;
  maxMembers: number;
  hostName: string | null;
  currentVideo: string | null;
}

// ─── User Watch Stats (Phase 4) ─────────────────────────────────

export interface UserWatchStats {
  totalWatchTimeMinutes: number;
  videosWatched: number;
  roomsCreated: number;
  roomsJoined: number;
  messagesSent: number;
  reactionsUsed: number;
}

// ─── Playlists (Phase 3) ────────────────────────────────────────

export interface Playlist {
  id: string;
  name: string;
  userId: string;
  items: PlaylistItem[];
  createdAt: number;
  updatedAt: number;
}

export interface PlaylistItem {
  url: string;
  mediaType: MediaType;
  title: string;
  duration: number | null;
  thumbnailUrl: string | null;
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
  | 'NOT_LEADER'
  | 'NOT_IN_ROOM'
  | 'ALREADY_IN_ROOM'
  | 'INVALID_PAYLOAD'
  | 'INVALID_URL'
  | 'QUEUE_FULL'
  | 'INTERNAL_ERROR'
  | 'RATE_LIMITED'
  | 'BANNED';

export interface RmhTubeError {
  code: RmhTubeErrorCode;
  message: string;
}
