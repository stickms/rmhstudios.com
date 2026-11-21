/** Request shapes and pure rules for "Blocked and muted" (s05-14). Client-safe: zod and plain data only. */
import { z } from 'zod';

/** People per page, and the longest filter text the list accepts. */
export const BLOCKED_MUTED_PAGE_SIZE = 50;
export const BLOCKED_MUTED_QUERY_MAX = 64;

export const BLOCKED_MUTED_TABS = ['blocked', 'muted'] as const;
export type BlockedMutedTab = (typeof BLOCKED_MUTED_TABS)[number];

export const blockedMutedQuery = z.object({
  tab: z.enum(BLOCKED_MUTED_TABS).default('blocked'),
  q: z.string().trim().max(BLOCKED_MUTED_QUERY_MAX).optional(),
  after: z.string().min(1).max(200).optional(),
});

/** What the toggle endpoints do for a request: the explicit intent wins, an absent one flips the current state. */
export type ToggleAction = 'create' | 'delete' | 'none';

/**
 * `exists` is whether the row is there now; `want` is the explicit `block` / `mute` from the body. A stale list that
 * says "unblock" can therefore never create a block, and "block" on an existing block changes nothing.
 */
export function toggleAction(exists: boolean, want: boolean | undefined): ToggleAction {
  if (want === undefined) return exists ? 'delete' : 'create';
  if (want === exists) return 'none';
  return want ? 'create' : 'delete';
}
