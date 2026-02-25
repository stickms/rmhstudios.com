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
});

export const BrowseRoomsSchema = z.object({
  limit: z.number().int().min(1).max(50).optional().default(20),
});

// ─── Video Sync Payloads ─────────────────────────────────────────

export const HostStateSchema = z.object({
  playing: z.boolean(),
  currentTime: z.number().min(0),
  playbackRate: z.number().min(0.25).max(4),
  timestamp: z.number(),
});

export const SeekSchema = z.object({
  time: z.number().min(0),
});

// ─── Queue Payloads ──────────────────────────────────────────────

export const QueueAddSchema = z.object({
  url: z.string().url().max(2048),
  title: z.string().max(256).optional(),
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

// ─── Reaction Payloads ───────────────────────────────────────────

export const ReactionSchema = z.object({
  emoji: z.string().min(1).max(8),
});
