/** Zod for /api/admin/communities (server side; the client sees only the types, by `import type`). */
import { z } from 'zod';
import { COMMUNITY_FILTERS } from '@/lib/admin/communities';
import { DELIST_REASON_MAX, DELIST_REASON_MIN } from '@/lib/communities/discovery';

/** One value each: repeated parameters do not survive. */
export const listCommunitiesQuery = z.object({
  filter: z.enum(COMMUNITY_FILTERS).default('all'),
  q: z.string().trim().max(60).optional(),
  cursor: z.string().max(100).optional(),
});

/** A reason is plain text, trimmed. */
export const delistCommunityBody = z.object({
  reason: z.string().trim().min(DELIST_REASON_MIN).max(DELIST_REASON_MAX),
});
