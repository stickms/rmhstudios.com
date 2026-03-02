/**
 * RmhTube — Server-Side Types
 *
 * In-memory representations used by the server process.
 * DB models (Prisma) are the source of truth for persisted data;
 * these types extend them with ephemeral runtime state.
 */

export type MediaType = 'youtube' | 'twitch' | 'direct';
export type MemberRole = 'host' | 'moderator' | 'member';
export type UserPresenceStatus = 'watching' | 'afk' | 'brb';

export interface RmhTubeMember {
  userId: string;
  userName: string;
  avatarUrl: string | null;
  socketId: string | null;
  isConnected: boolean;
  joinedAt: number;
  lastSeenAt: number;
  role: MemberRole;
  status: UserPresenceStatus;
}

export interface QueueItem {
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

export interface VideoState {
  playing: boolean;
  currentTime: number;
  playbackRate: number;
  updatedAt: number;
}

export interface RoomSettings {
  isPublic: boolean;
  maxMembers: number;
  allowMemberQueue: boolean;
  allowMemberSkip: boolean;
  autoPlay: boolean;
  password: string | null;
  queueVoting: boolean;
  autoSortByVotes: boolean;
  loopQueue: boolean;
  customReactions: string[] | null;
}

export interface BannedUser {
  userId: string;
  userName: string;
  bannedAt: number;
  bannedBy: string;
  reason: string | null;
}

export interface InviteLink {
  code: string;
  roomId: string;
  createdBy: string;
  expiresAt: number;
  maxUses: number;
  useCount: number;
}

export interface RmhTubeRoom {
  id: string;
  name: string | null;
  hostUserId: string;
  settings: RoomSettings;
  members: Map<string, RmhTubeMember>;
  queue: QueueItem[];
  currentItem: QueueItem | null;
  currentIndex: number;
  videoState: VideoState;
  chat: ChatMessage[];
  skipVotes: Set<string>;
  createdAt: number;
  lastActivityAt: number;
  seq: number;
  // Phase 1: Pinned message
  pinnedMessage: ChatMessage | null;
  // Phase 1: Typing users (userId → timeout handle)
  typingTimers: Map<string, ReturnType<typeof setTimeout>>;
  // Phase 1: Chat reactions (messageId → emoji → Set<userId>)
  chatReactions: Map<string, Map<string, Set<string>>>;
  // Phase 3: Queue votes (itemId → Set<userId>)
  queueVotes: Map<string, Set<string>>;
  // Phase 3: Played items history
  playedItems: QueueItem[];
  // Phase 4: Ban list
  bannedUsers: BannedUser[];
  // Phase 4: Invite links
  inviteLinks: InviteLink[];
}

export interface ChatMessage {
  id: string;
  userId: string;
  userName: string;
  content: string;
  createdAt: number;
  replyToId: string | null;
  replyToContent: string | null;
  replyToUserName: string | null;
  mentions: string[];
  timestamp: number | null;
}
