/** Contract for the "Blocked and muted" settings list (s05-14). Client-safe: types only. */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type { BlockedMutedTab, blockedMutedQuery } from '@/lib/moderation/blocked-muted-schema';

/** One person the member blocked or muted. A deleted account carries no name, handle or picture. */
export interface BlockedMutedRow {
  /** The person's account id, which the unblock / unmute call takes. */
  userId: string;
  deleted: boolean;
  name: string | null;
  handle: string | null;
  image: string | null;
  /** When the member blocked or muted them. */
  since: string;
  /** Muted accounts only: when a timed mute ends (ISO); null for a block or a mute until the member unmutes (s10-10). */
  expiresAt: string | null;
}

export interface BlockedMutedPage {
  tab: BlockedMutedTab;
  items: BlockedMutedRow[];
  nextCursor: string | null;
  /** Everything the member blocked and muted, whatever the filter. */
  counts: { blocked: number; muted: number };
}

/** The caller's own blocks or mutes, newest first, 50 a page, optionally filtered by name or handle prefix. */
export const listBlockedMutedApi = endpoint<{
  query: z.infer<typeof blockedMutedQuery>;
  res: BlockedMutedPage;
}>()({ method: 'GET', path: '/api/settings/blocked' });
