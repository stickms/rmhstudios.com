/**
 * Quiet counts (sprint 04 #14): the pure rules.
 *
 * Two independent switches live on `UserProfile`:
 *
 * - `hideCountsOnMine` is the AUTHOR's setting. It is enforced on the server, in every path that returns a post's
 *   like, reply, repost or view number: another viewer gets `null` for each, never the real figure, so nothing
 *   leaks through an API, an embed or an image. The author always sees their own numbers.
 * - `hideCountsInFeed` is the VIEWER's setting about what they see while browsing, applied on the client by
 *   `displayCount`.
 *
 * Ranking, trending and notifications keep using the real numbers: redaction happens at serialisation, last.
 * `QUIET_COUNT_READ_PATHS` lists every source file that puts a post's counts in front of somebody other than its
 * author; `quiet-counts.test.ts` reads them and fails any other file that serialises a count without being named.
 */

/** The four per-post numbers the switches cover. */
export const POST_COUNT_FIELDS = ['likeCount', 'commentCount', 'repostCount', 'viewCount'] as const;

type CountFields = { [K in (typeof POST_COUNT_FIELDS)[number]]?: number | null };

/** Whether `viewerId` may not see the numbers on a post by `authorId` whose author has chosen to hide them. */
export function countsHiddenFrom(
  authorId: string | null | undefined,
  authorHidesCounts: boolean | null | undefined,
  viewerId: string | null | undefined,
): boolean {
  if (authorHidesCounts !== true) return false;
  return !viewerId || viewerId !== authorId;
}

/** A copy of `fields` with the four counts set to `null` (the shape every serialiser answers with). */
export function nullPostCounts<T extends CountFields>(fields: T): T {
  return { ...fields, likeCount: null, commentCount: null, repostCount: null, viewCount: null };
}

/**
 * A feed item as seen by `viewerId`: counts `null` when its author hides them and the viewer is somebody else.
 * The author's switch rides on `item.user.hideCounts` (joined into the existing author select, so it costs no
 * query). Applied last, after any ranking, so ordering still uses the real numbers.
 */
export function redactCounts<T extends CountFields & { user?: { id: string; hideCounts?: boolean } | undefined }>(
  item: T,
  viewerId: string | null | undefined,
): T {
  return countsHiddenFrom(item.user?.id, item.user?.hideCounts, viewerId) ? nullPostCounts(item) : item;
}

/**
 * The number to draw beside an action: nothing when the viewer chose to browse without counts or when the server
 * withheld it (`null`). A viewer's switch hides numbers on their own posts too.
 */
export function displayCount(value: number | null | undefined, viewerHidesInFeed: boolean): number | null {
  if (viewerHidesInFeed || value === null || value === undefined) return null;
  return value;
}

/**
 * A count moved by `delta` for an optimistic update. A withheld (`null`) count stays withheld, so liking or replying
 * to a post whose author hides its numbers does not make a "1" appear.
 */
export function bumpCount(value: number | null | undefined, delta: number): number | null {
  if (value === null) return null;
  return Math.max(0, (value ?? 0) + delta);
}

/**
 * Every source file that returns a post's counts to somebody other than its author. Each one must redact through
 * `redactCounts`, `nullPostCounts` or `countsHiddenFrom` (the `/api/v1` route files, through
 * `serializePublicPost(post, viewerId)`). `quiet-counts.test.ts` reads these files, and fails any other file under `app/`, `lib/` or
 * `features/` that serialises a post's count without being named here, so a new path is added on purpose.
 */
export const QUIET_COUNT_READ_PATHS = [
  'lib/feed/map-feed-item.server.ts',
  'lib/feed/timeline.ts',
  'lib/feed/quoted-original.ts',
  'lib/feed/page-reconcile.server.ts',
  'lib/feed/api/rmharks.$id.server.ts',
  'lib/profile/api/profile.$id.rmharks.server.ts',
  'lib/bookmarks.server.ts',
  'lib/api/serializers.server.ts',
  'app/routes/api/v1/feed.ts',
  'lib/api/v1/search.server.ts',
  'lib/api/v1/communities.server.ts',
  'app/routes/api/v1/posts/$id.ts',
  'app/routes/api/v1/users/$handle/posts.ts',
  'app/routes/api/v1/me/bookmarks.ts',
  'lib/social/engagement.server.ts',
  'lib/og/api/og.post.$id.server.ts',
  'app/routes/embed.post.$id.tsx',
  'lib/search/posts.server.ts',
  'lib/discovery/today.server.ts',
  'lib/digest/assemble.server.ts',
  'lib/communities/insights.server.ts',
] as const;
