/**
 * Named HTTP cache policies for site API `GET` handlers (`defineHandler({ cache })`).
 *
 * One definition per *kind of data*, so the staleness a route accepts is decided
 * once, written next to the number, and reviewable in one place — instead of the
 * same four literals being re-derived in every route file.
 *
 * Every entry is `visibility: 'public'`, which `defineHandler` allows only for a
 * response that is byte-identical for every caller. **Using one of these is a
 * claim that the handler (and everything it calls) never reads the session, a
 * cookie or a request header.** `auth: 'none'` is not proof of that — 46 of 69
 * `auth: 'none'` handlers read the session themselves
 * (docs/loading-audit-2026-08-11/03-api-caching.md §2). The claim is enforced
 * two ways, both in `lib/__tests__/api-cache-policy.test.ts`:
 *
 *  - statically, by `scripts/api-cache-triage.ts`, which walks the handler and
 *    every repo function it calls and fails the test if a session/cookie/header/
 *    viewer signal is reachable from a route that declares a public policy;
 *  - dynamically, by calling each public route with and without credentials and
 *    asserting the session was never read and the two responses are identical.
 *
 * Query params and path params are part of the URL and therefore of every
 * cache's key; they need no `vary`.
 *
 * Why each window is what it is (rule 03-rules.md §1.2: a TTL is a product
 * decision, written down):
 */
import type { CacheSpec } from '@/lib/api/handler.server';

export const CACHE_POLICY = {
  /**
   * Global top-N board (scores, reputation, standings). The board moves when a
   * run is submitted or a forecast resolves, never per request; a player seeing
   * their own score up to a minute late is the accepted cost on every
   * leaderboard here. Same numbers as the pre-existing `altair`, `vega`,
   * `void-breaker`, ... leaderboards, so all boards behave alike.
   * Worst-case staleness a client can observe: 30 + 300 s via SWR.
   */
  leaderboard: { visibility: 'public', maxAge: 30, sMaxAge: 60, staleWhileRevalidate: 300 },

  /**
   * A list or card that is the same for everyone and changes on user action
   * (a tournament opening, an achievement unlocking, an incident reported) where
   * the actor will look at it soon after. Tight on purpose: 15 s in a browser,
   * 30 s in a shared cache, one minute of serve-stale. Display-only data — the
   * routes that spend coins or join a bracket read fresh.
   */
  liveList: { visibility: 'public', maxAge: 15, sMaxAge: 30, staleWhileRevalidate: 60 },

  /**
   * Derived from published content that is written once and read many times,
   * where producing the value is the expensive part (an AI round trip). An edit
   * to the source changes the server-side memo key at once; a reader's copy is
   * at most five minutes behind it. The long shared/stale windows protect the
   * generator, not the reader.
   */
  derivedContent: {
    visibility: 'public',
    maxAge: 300,
    sMaxAge: 3600,
    staleWhileRevalidate: 86_400,
  },

  /**
   * History: records that only change when a past entry is edited by an
   * organiser. Five minutes in a browser, fifteen in a shared cache, matching
   * the calendar feeds that expose the same rows.
   */
  archive: { visibility: 'public', maxAge: 300, sMaxAge: 900, staleWhileRevalidate: 3600 },
} as const satisfies Record<string, CacheSpec>;

export type CachePolicyName = keyof typeof CACHE_POLICY;
