import { z } from 'zod';

export const CreateRoomSchema = z.object({
  name: z.string().min(1).max(64).optional(),
  isPublic: z.boolean().optional(),
  password: z.string().max(64).optional(),
});

export const JoinRoomSchema = z.object({
  code: z.string().min(1).max(10).regex(/^[A-Za-z0-9]+$/),
  password: z.string().max(64).optional(),
});

export const ChatSchema = z.object({
  content: z.string().min(1).max(300).transform((s) => s.trim()).pipe(z.string().min(1)),
});

export const TransferHostSchema = z.object({
  targetUserId: z.string(),
});

export const BrowseRoomsSchema = z.object({
  limit: z.number().int().min(1).max(50).optional().default(20),
});

export const MusicPlaySchema = z.object({
  trackUri: z.string().min(1),
  positionMs: z.number().min(0),
  track: z.object({
    spotifyUri: z.string(),
    title: z.string().max(256),
    artist: z.string().max(256),
    albumArt: z.string().url().max(500),
    durationMs: z.number().int().min(0),
  }),
});

export const MusicPauseSchema = z.object({
  positionMs: z.number().min(0),
});

export const MusicSeekSchema = z.object({
  positionMs: z.number().min(0),
});

export const QueueAddSchema = z.object({
  spotifyUri: z.string().min(1),
  title: z.string().max(256),
  artist: z.string().max(256),
  albumArt: z.string().url().max(500),
  durationMs: z.number().int().min(0),
});

export const QueueRemoveSchema = z.object({
  itemId: z.string(),
});

export const QueueReorderSchema = z.object({
  itemId: z.string(),
  newPosition: z.number().int().min(0),
});
