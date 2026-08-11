/**
 * RmhTube — Server-Side Types
 *
 * In-memory representations used by the server process.
 * DB models (Prisma) are the source of truth for persisted data;
 * these types extend them with ephemeral runtime state.
 */

import type { MediaType, VideoState, RoomSettings } from '../../lib/rmhtube/types';

export type { MediaType, VideoState, RoomSettings };

export type MemberRole = 'host' | 'member';
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
  /** No fixed timeline — mirror play/pause instead of synchronising a position. */
  live: boolean;
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
  leaderUserId: string;
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

  /** Wait-for-slow-peers state (see `sync-engine.ts`). */
  peerWait: PeerWaitRuntime;
}

export interface PeerWaitRuntime {
  /** userId → server-clock ms the member reported it was starved of data. */
  stalled: Map<string, number>;
  /** When the room auto-paused for a buffering member, else null. */
  startedAt: number | null;
  /** The room was playing when it paused, so resume once everyone is back. */
  resumeAfter: boolean;
  /**
   * No new wait before this instant. Set when a wait times out, so a member who
   * never recovers cannot re-pause the room every few seconds forever.
   */
  cooldownUntil: number;
  /** Last broadcast peer set, so an unchanged one is not re-sent every tick. */
  signature: string;
}

export function createPeerWaitRuntime(): PeerWaitRuntime {
  return { stalled: new Map(), startedAt: null, resumeAfter: false, cooldownUntil: 0, signature: '' };
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
