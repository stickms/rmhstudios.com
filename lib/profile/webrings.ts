/**
 * P6 — webring limits and schemas (client-safe). The ring-order and hop maths
 * are in `lib/profile/webring.ts` (the template); this file is only the rules
 * around creating and joining a ring.
 */
import { z } from 'zod';
import type { ResolvedUser } from '@/lib/user-display';

export const RING_NAME_MAX = 60;
export const RING_DESCRIPTION_MAX = 280;
/** Rings one member may create / belong to. */
export const RING_MAX_OWNED = 3;
export const RING_MAX_JOINED = 6;
/** Members per ring — the strip walks the whole ring, so it is bounded. */
export const RING_MAX_MEMBERS = 500;
/** Rings shown on a profile strip. */
export const RING_STRIP_MAX = 3;

export const createRingSchema = z.object({
  name: z.string().trim().min(3).max(RING_NAME_MAX),
  description: z.string().trim().max(RING_DESCRIPTION_MAX).optional(),
});
export type CreateRingInput = z.infer<typeof createRingSchema>;

/** A URL slug from a ring name: lowercase ascii words joined by `-`. */
export function ringSlugBase(name: string): string {
  const slug = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return slug || 'ring';
}

export const ringSlugSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9-]+$/);

export interface RingSummary {
  slug: string;
  name: string;
  description: string | null;
  memberCount: number;
}

export interface RingNeighbour {
  id: string;
  handle: string | null;
  name: string | null;
}

/** One ring on a profile: where this member sits and who is next door. */
export interface RingStrip extends RingSummary {
  position: number;
  size: number;
  prev: RingNeighbour | null;
  next: RingNeighbour | null;
}

export interface RingMemberView extends ResolvedUser {
  joinedAt: string;
}

export interface RingDetail extends RingSummary {
  /** Ring id — what a report names (`entityType: 'webring'`). */
  id: string;
  isOwner: boolean;
  isMember: boolean;
  members: RingMemberView[];
}
