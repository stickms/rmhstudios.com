/** Zod inputs for `/api/feed/repost-mutes` (sprint 05 #07). Server-side only: the contract imports types from here. */
import { z } from 'zod';
import { REPOST_MUTE_SEARCH_MAX } from './repost-mutes';

export const repostMuteBodySchema = z.object({
  targetUserId: z.string().min(1).max(64),
  off: z.boolean(),
});

export const repostMuteListQuerySchema = z.object({
  cursor: z.string().max(200).optional(),
  q: z.string().trim().max(REPOST_MUTE_SEARCH_MAX).optional(),
  /** Ask whether one person's reposts are off (the post menu); the response then carries no rows. */
  target: z.string().min(1).max(64).optional(),
});
