'use client';

import { startIntentFetch } from '@/lib/route/intent-fetch';

/**
 * The first page of a profile's posts, as `ProfileColumn` requests it.
 *
 * The profile header comes from the route loader, but the post list was only
 * requested once the page had mounted — a second round trip after the loader on
 * every profile open. The route's `beforeLoad` starts it at the navigation
 * instead (take-once rules: `lib/route/intent-fetch`).
 */
export const profilePostsFirstPageUrl = (userId: string) =>
  `/api/profile/${encodeURIComponent(userId)}/rmharks?${new URLSearchParams({ limit: '20' })}`;

/** Start a profile's first page of posts. Client-only; idempotent for 15s. */
export function prefetchProfilePosts(userId: string): void {
  if (!userId) return;
  startIntentFetch(profilePostsFirstPageUrl(userId));
}
