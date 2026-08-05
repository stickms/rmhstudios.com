/**
 * React Query key factory (plan D6).
 *
 * Query keys are currently written inline at each call site — `['trash', filter]`,
 * `['shop']`, `['gabriels-horn', 'leaderboard']` — which works right up to the
 * first invalidation. Then a mutation in one file has to guess the key another
 * file wrote, a typo silently invalidates nothing (React Query has no way to
 * tell a wrong key from a cold one), and the stale list stays on screen. This
 * module is the shared vocabulary so both halves spell it the same way.
 *
 * Two rules the shapes encode:
 *
 *  - **Prefixes are invalidation handles.** React Query matches keys by prefix,
 *    so `queryKeys.posts()` (`['post']`) invalidates every post, and
 *    `queryKeys.post(id)` just the one. Every family exposes both.
 *  - **Dependent data nests under its parent.** Comments are
 *    `['post', id, 'comments', …]`, not `['comments', id]`, so posting a
 *    comment can invalidate `queryKeys.post(id)` and take the comment list with
 *    it — one call, no chance of the count and the list disagreeing.
 *
 * Optional discriminators are normalised to `null` rather than left off: a key
 * that changes LENGTH between renders is a different cache entry, which is how
 * "the list refetches when I clear the filter" bugs happen.
 */

export type FeedScope = 'home' | 'following' | 'explore' | 'tag' | 'user' | 'community';
export type NotificationFilter = 'all' | 'mentions' | 'unread';

export const queryKeys = {
  /** Every feed timeline. */
  feeds: () => ['feed'] as const,
  /** One timeline — `scope` plus its parameter (tag name, handle, community id). */
  feed: (scope: FeedScope, param?: string | null, filter?: string | null) =>
    ['feed', scope, param ?? null, filter ?? null] as const,

  /** Every post, and everything hanging off one (comments included). */
  posts: () => ['post'] as const,
  post: (id: string) => ['post', id] as const,
  /** Nested under the post on purpose — see the note above. */
  postComments: (id: string, sort?: string | null) =>
    ['post', id, 'comments', sort ?? null] as const,

  profiles: () => ['profile'] as const,
  /** Keyed by handle, which is what routes carry; ids resolve to a handle first. */
  profile: (handle: string) => ['profile', handle] as const,

  leaderboards: () => ['leaderboard'] as const,
  /** `board` is the game/app id or ladder name; `period` the window ('daily', 'all-time'). */
  leaderboard: (board: string, period?: string | null) =>
    ['leaderboard', board, period ?? null] as const,

  notifications: (filter?: NotificationFilter | null) => ['notifications', filter ?? null] as const,
  /** Prefix for the unread badge + the list together. */
  notificationsAll: () => ['notifications'] as const,

  activityAll: () => ['activity'] as const,
  /** A user's activity stream; `kind` narrows it ('posts', 'likes', 'replies'). */
  activity: (userId: string, kind?: string | null) => ['activity', userId, kind ?? null] as const,
} as const;

/** The key any builder above produces. */
export type AppQueryKey = ReturnType<(typeof queryKeys)[keyof typeof queryKeys]>;
