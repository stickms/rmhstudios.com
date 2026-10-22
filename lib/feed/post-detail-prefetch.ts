'use client';

import { startIntentFetch } from '@/lib/route/intent-fetch';

/**
 * The URLs `PostDetail` reads, and the head start for them.
 *
 * `PostDetail` fetched the post body and its comments from a mount effect, so
 * opening a post that was not already in the feed store (from a profile,
 * explore, a notification, search) waited for the route's loader and chunk and
 * only THEN — after a spinner frame — for `/api/rmharks/:id` and `/comment`.
 * {@link prefetchPostDetail} starts both as the open begins: the route's
 * `beforeLoad` on every navigation, and a press on a post card's body. The
 * when-and-how-long rules (never on hover, taken once, 1s once answered) live
 * in `lib/route/intent-fetch`, because the response is per-viewer.
 */
export const postBodyUrl = (postId: string) => `/api/rmharks/${encodeURIComponent(postId)}`;
export const postCommentsUrl = (postId: string) =>
  `/api/rmharks/${encodeURIComponent(postId)}/comment`;

/** Start the detail page's two GETs for a post. Client-only. */
export function prefetchPostDetail(postId: string): void {
  if (!postId) return;
  startIntentFetch(postBodyUrl(postId));
  startIntentFetch(postCommentsUrl(postId));
}
