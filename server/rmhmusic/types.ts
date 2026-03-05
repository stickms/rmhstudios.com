import type { TrackInfo } from '../../lib/rmhmusic/types';

export interface ServerRoom {
  id: string;
  code: string;
  name: string;
  hostUserId: string;
  isPublic: boolean;
  password: string | null;
  maxMembers: number;
  members: Map<string, ServerMember>;
  queue: ServerQueueItem[];
  currentTrack: TrackInfo | null;
  playback: { trackUri: string | null; positionMs: number; isPlaying: boolean; updatedAt: number };
  chat: ServerChatMessage[];
  seq: number;
  createdAt: number;
  lastActivityAt: number;
}

export interface ServerMember {
  userId: string;
  userName: string;
  avatarUrl: string | null;
  socketId: string;
  isConnected: boolean;
  joinedAt: number;
  disconnectedAt: number | null;
}

export interface ServerQueueItem {
  id: string;
  spotifyUri: string;
  title: string;
  artist: string;
  albumArt: string;
  durationMs: number;
  previewUrl: string | null;
  addedById: string;
  addedByName: string;
  position: number;
  addedAt: number;
}

export interface ServerChatMessage {
  id: string;
  userId: string;
  userName: string;
  content: string;
  createdAt: number;
}
