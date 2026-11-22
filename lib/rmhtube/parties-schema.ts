/** Zod schemas for the watch-party endpoints (the contract imports their types only). */
import { z } from 'zod';
import { ABSOLUTE_MAX_MEMBERS } from '@/lib/rmhtube/constants';
import { parseMedia } from '@/lib/rmhtube/media';

export const PARTY_NAME_MAX = 80;
export const PARTY_DESCRIPTION_MAX = 500;

const name = z.string().trim().min(1).max(PARTY_NAME_MAX);
const description = z.string().trim().max(PARTY_DESCRIPTION_MAX);
const startsAt = z.string().datetime();

/** A first video the room's queue starts with: anything the player can embed (`parseMedia`). */
const firstVideoUrl = z
  .string()
  .trim()
  .url()
  .max(2048)
  .refine((u) => parseMedia(u) !== null);

/**
 * Strict, so a `password` (or any other field this endpoint does not take) is a 400 rather than silently
 * dropped: a password cannot be shared on a public party page, so a party is never created with one.
 */
export const scheduleBody = z.strictObject({
  name,
  description: description.optional(),
  startsAt,
  isPublic: z.boolean(),
  maxMembers: z.number().int().min(2).max(ABSOLUTE_MAX_MEMBERS),
  firstVideoUrl: firstVideoUrl.optional(),
});

export const updatePartyBody = z
  .object({
    name: name.optional(),
    description: description.optional(),
    startsAt: startsAt.optional(),
  })
  .refine((b) => b.name !== undefined || b.description !== undefined || b.startsAt !== undefined);

export const partyParams = z.object({
  roomId: z.string().regex(/^[A-Za-z0-9]{6}$/),
});
