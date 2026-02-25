/**
 * RmhTube — Server-Side Types
 *
 * In-memory representations used by the server process.
 * DB models (Prisma) are the source of truth for persisted data;
 * these types extend them with ephemeral runtime state.
 */

export type MediaType = 'youtube' | 'twitch' | 'direct';

export interface RmhTubeMember {
  userId: string;
  userName: string;
  avatarUrl: string | null;
  socketId: string | null;
  isConnected: boolean;
  joinedAt: number;
  lastSeenAt: number;
  role: 'host' | 'member';
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
}

export interface ChatMessage {
  id: string;
  userId: string;
  userName: string;
  content: string;
  createdAt: number;
}
