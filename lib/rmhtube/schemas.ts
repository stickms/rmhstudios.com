/**
 * RmhTube — Shared Zod Validation Schemas
 *
 * Runtime validation schemas for all WebSocket payloads.
 */

import { z } from 'zod';

// ─── Room Settings (partial — for create/update) ─────────────────

export const RoomSettingsSchema = z.object({
  isPublic: z.boolean().optional(),
  maxMembers: z.number().int().min(2).max(50).optional(),
  allowMemberQueue: z.boolean().optional(),
  allowMemberSkip: z.boolean().optional(),
  autoPlay: z.boolean().optional(),
  password: z.string().max(64).nullable().optional(),
  queueVoting: z.boolean().optional(),
  autoSortByVotes: z.boolean().optional(),
  loopQueue: z.boolean().optional(),
  customReactions: z.array(z.string().min(1).max(8)).min(4).max(12).nullable().optional(),
  waitForSlowPeers: z.boolean().optional(),
});

// ─── Client → Server Event Payloads ──────────────────────────────

export const CreateRoomSchema = z.object({
  settings: RoomSettingsSchema.optional(),
  name: z.string().max(64).optional(),
});

export const JoinRoomSchema = z.object({
  roomId: z.string().min(1).max(64).regex(/^[A-Za-z0-9]+$/),
  password: z.string().max(64).optional(),
});

export const KickMemberSchema = z.object({
  targetUserId: z.string(),
});

export const TransferHostSchema = z.object({
  targetUserId: z.string(),
});

export const UpdateSettingsSchema = z.object({
  settings: RoomSettingsSchema,
});

export const ChatSchema = z.object({
  content: z.string().min(1).max(300).transform((s) => s.trim()).pipe(z.string().min(1)),
  replyToId: z.string().optional(),
  mentions: z.array(z.string()).max(20).optional(),
  timestamp: z.number().min(0).nullable().optional(),
});

export const BrowseRoomsSchema = z.object({
  limit: z.number().int().min(1).max(50).optional().default(20),
});

// ─── Video Sync Payloads ─────────────────────────────────────────

export const HostStateSchema = z.object({
  playing: z.boolean(),
  currentTime: z.number().min(0),
  playbackRate: z.number().min(0.25).max(4),
  /**
   * The leader's estimate of the server clock when it read `currentTime`.
   * Anchoring on this instead of the receive time removes one-way network
   * latency from every anchor the room is built on.
   */
  timestamp: z.number(),
  /** The leader's playhead is not advancing — hold the timeline. */
  stalled: z.boolean().optional().default(false),
  /** The source turned out to have no fixed timeline. */
  live: z.boolean().optional().default(false),
});

export const SeekSchema = z.object({
  time: z.number().min(0),
});

/** Any viewer reporting whether it is starved of data. */
export const StallSchema = z.object({
  stalled: z.boolean(),
});

export const PingSchema = z.object({
  clientTime: z.number(),
});

export const SetSpeedSchema = z.object({
  speed: z.number().min(0.25).max(4),
});

// ─── Queue Payloads ──────────────────────────────────────────────

export const QueueAddSchema = z.object({
  url: z.string().url().max(2048),
  title: z.string().max(256).optional(),
});

/**
 * Metadata the leader's player learned about the item it is playing. The URL
 * cannot tell us a video's duration, and it cannot reliably tell us whether a
 * YouTube link is a broadcast — only the loaded player knows.
 */
export const QueueMetaSchema = z.object({
  itemId: z.string(),
  duration: z.number().min(0).max(24 * 60 * 60).nullable().optional(),
  live: z.boolean().optional(),
  title: z.string().min(1).max(256).optional(),
});

export const QueueRemoveSchema = z.object({
  itemId: z.string(),
});

export const QueueReorderSchema = z.object({
  itemId: z.string(),
  newPosition: z.number().int().min(0),
});

export const QueuePlayItemSchema = z.object({
  itemId: z.string(),
});

export const QueueVoteSchema = z.object({
  itemId: z.string(),
});

// ─── Reaction Payloads ───────────────────────────────────────────

export const ReactionSchema = z.object({
  emoji: z.string().min(1).max(8),
});

// ─── Phase 1: Chat Reactions ─────────────────────────────────────

export const ChatReactSchema = z.object({
  messageId: z.string(),
  emoji: z.string().min(1).max(8),
});

// ─── Phase 1: Pin Message ────────────────────────────────────────

export const ChatPinSchema = z.object({
  messageId: z.string().nullable(),
});

// ─── Phase 4: Leader Management ──────────────────────────────────

export const SetLeaderSchema = z.object({
  targetUserId: z.string(),
});

// ─── Phase 4: Ban Management ─────────────────────────────────────

export const BanSchema = z.object({
  targetUserId: z.string(),
  reason: z.string().max(100).optional(),
});

export const UnbanSchema = z.object({
  targetUserId: z.string(),
});

// ─── Phase 4: Invite Links ──────────────────────────────────────

export const CreateInviteSchema = z.object({
  expiresIn: z.enum(['1h', '6h', '24h', '7d', 'never']).optional().default('24h'),
  maxUses: z.number().int().min(0).max(100).optional().default(0),
});

// ─── Phase 4: User Status ───────────────────────────────────────

export const SetStatusSchema = z.object({
  status: z.enum(['watching', 'afk', 'brb']),
});

// ─── Phase 4: Room History Validation ──────────────────────────

export const CheckHistorySchema = z.object({
  roomIds: z.array(z.string().min(1).max(64)).max(20),
});
