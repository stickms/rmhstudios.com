import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * ─────────── the API wrapper is adopted, and stays adopted (D2) ───────────
 *
 * `defineHandler` (`lib/api/handler.server.ts`) is the ONLY place in the
 * codebase where the order **session → rate limit → zod parse → try/catch** is
 * written down. `lib/__tests__/api-handler.test.ts` proves that order is
 * correct; this file proves the routes actually *use* it.
 *
 * That second half is not pedantry — it is where the real bugs live. Every
 * hand-rolled route re-implements four security decisions from memory, and the
 * ones that got them wrong all failed the same way:
 *
 *   • no `try/catch` → a thrown Prisma error escapes as the framework's default
 *     500 **with the message attached**, which is how a connection string or a
 *     column name ends up in a client-visible body. `defineHandler` logs the
 *     error and returns a bare `{ error: 'Internal Server Error' }`.
 *   • validation before auth → an anonymous caller gets a 400 that tells them
 *     the shape of a body they were never allowed to send.
 *   • `zod.parse` instead of `safeParse` → the throw above, on every bad input.
 *   • no rate limit at all → the default when nobody remembers to add one.
 *
 * Two static rules, both source scans (no build, no DB), over
 * `app/routes/api/**`:
 *
 *   1. **Every route file references a wrapper.** `defineHandler` for the site
 *      API, or `withDeveloperApi` for `/api/v1/**` (which speaks a different
 *      error envelope and therefore keeps its own richer wrapper — see
 *      CLAUDE.md §3).
 *   2. **A wrapped route does not call `auth.api.getSession` itself.** A file
 *      that imports the wrapper *and* reaches past it for the session is the
 *      worst of the two worlds: it looks migrated at a glance, but the auth
 *      decision is back in the handler body. In practice every instance is the
 *      same shape — `defineHandler({ auth: 'none' }, …)` followed by a manual
 *      `getSession` + `if (!session) return 401`, which is `auth: 'required'`
 *      spelled the long way, or a `try { getSession } catch { null }` block,
 *      which is exactly `auth: 'optional'`. Both already exist as one word of
 *      config, and the wrapper's version cannot forget the try/catch.
 *
 * Raw `auth.api.getSession` is still correct OUTSIDE an API route (server
 * functions, workers, the socket hubs) — this scan only covers
 * `app/routes/api/**`.
 */

const ROOT = process.cwd();
const API_DIR = join('app', 'routes', 'api');

/** Recursively collect every `.ts` file under `app/routes/api/`. */
function collectRoutes(dir: string, out: string[] = []): string[] {
  let entries;
  try {
    entries = readdirSync(join(ROOT, dir), { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const rel = join(dir, entry.name);
    if (entry.isDirectory()) {
      collectRoutes(rel, out);
    } else if (entry.name.endsWith('.ts')) {
      out.push(rel);
    }
  }
  return out;
}

/** Posix-normalised so the allowlists below read the same on every platform. */
const posix = (p: string): string => p.split(/[\\/]/).join('/');

interface RouteFile {
  /** Repo-relative, forward slashes. */
  file: string;
  src: string;
}

/**
 * Only files that actually declare a server handler are in scope. A route file
 * that is pure types, or a `createFileRoute` with only a loader, has nothing to
 * wrap.
 */
const ROUTES: RouteFile[] = collectRoutes(API_DIR)
  .map((f) => ({ file: posix(f), src: readFileSync(join(ROOT, f), 'utf8') }))
  .filter((r) => r.src.includes('server:') && r.src.includes('handlers'))
  .sort((a, b) => a.file.localeCompare(b.file));

const hasWrapper = (src: string): boolean =>
  src.includes('defineHandler') || src.includes('withDeveloperApi');

const callsGetSession = (src: string): boolean => /auth\.api\.getSession/.test(src);

/**
 * ───────────────────────── the migration backlog ─────────────────────────
 *
 * These two lists are a **ratchet, not permission**. They are the exact set of
 * route files that failed rules 1 and 2 on 2026-08-05, frozen so the gate can
 * be turned on today instead of after a 179-file migration lands. The contract
 * is one-directional:
 *
 *   • A file may be REMOVED from a list — that is what fixing it looks like.
 *   • A file may NEVER be ADDED. A new route, or a newly-broken old one, fails
 *     the build. There is no scenario where the right fix is a new entry here:
 *     `defineHandler` covers `auth: 'required' | 'optional' | 'admin' | 'none'`
 *     and every rate-limit policy, so anything a route needs it already does.
 *   • The lists may not ROT: `does not list an already-fixed route` below fails
 *     when an entry no longer violates its rule, which forces the deletion into
 *     the same commit as the fix. Without that test the list silently becomes a
 *     historical curiosity that nobody trusts or prunes.
 *
 * A handful of entries are permanent by nature rather than pending work — most
 * visibly `app/routes/api/auth/$.ts`, the Better Auth catch-all, which hands
 * the raw `Request` to the library's own handler and has no session/validation
 * step of its own to delegate. Those stay listed rather than getting a second
 * "exempt" mechanism; a one-line comment on the entry is enough, and keeping
 * one list means one place to look.
 *
 * Suggested burn-down order: the `auth: 'none'` + manual-`getSession` files in
 * KNOWN_BYPASSES_WRAPPER first (each is a one-word change to `auth: 'optional'`
 * or `auth: 'required'` plus deleting the block), then the admin routes in
 * KNOWN_UNWRAPPED (`auth: 'admin'` replaces a hand-rolled `isAdmin` check), then
 * the rest.
 */

/** Rule 1 backlog: route files that reference no wrapper at all. */
const KNOWN_UNWRAPPED: readonly string[] = [
  'app/routes/api/admin/albums/$id.ts',
  'app/routes/api/admin/albums/index.ts',
  'app/routes/api/admin/announcements.ts',
  'app/routes/api/admin/announcements/$id.ts',
  'app/routes/api/admin/library/$id.ts',
  'app/routes/api/admin/library/index.ts',
  'app/routes/api/admin/library/migrate.ts',
  'app/routes/api/admin/library/quota-requests.ts',
  'app/routes/api/admin/library/reorder.ts',
  'app/routes/api/admin/library/storage-health.ts',
  'app/routes/api/admin/predictions/index.ts',
  'app/routes/api/admin/vibe/backfill-thumbs.ts',
  'app/routes/api/ai/message-suggest.ts',
  'app/routes/api/albums/asset/$.ts',
  'app/routes/api/announcements.ts',
  // Permanent: the Better Auth catch-all. It forwards the raw Request to the
  // library's own handler; there is no session/validation step to delegate.
  'app/routes/api/auth/$.ts',
  'app/routes/api/battlepass/claim.ts',
  'app/routes/api/battlepass/unlock.ts',
  'app/routes/api/builds/cover/$file.ts',
  'app/routes/api/client-error.ts',
  'app/routes/api/coins/gift.ts',
  'app/routes/api/coins/tip.ts',
  'app/routes/api/creators/$id/join.ts',
  'app/routes/api/cron/webhooks.ts',
  'app/routes/api/discord/activity-image.ts',
  'app/routes/api/email/unsubscribe.ts',
  'app/routes/api/events/$id/ics.ts',
  'app/routes/api/explore.ts',
  'app/routes/api/feed/image/$filename.ts',
  'app/routes/api/feed/stream.ts',
  'app/routes/api/games/synapse-storm/save.ts',
  'app/routes/api/gif/search.ts',
  'app/routes/api/gift-sub.ts',
  'app/routes/api/health.ts',
  'app/routes/api/homes/geocode.ts',
  'app/routes/api/internal/match-result.ts',
  'app/routes/api/internal/notify-message.ts',
  'app/routes/api/internal/notify-typing.ts',
  'app/routes/api/internal/predictions-tick.ts',
  'app/routes/api/internal/streak-push.ts',
  'app/routes/api/library/cover/$id.ts',
  'app/routes/api/library/file/$id.ts',
  'app/routes/api/library/quota.ts',
  'app/routes/api/market/listings/$id/buy.ts',
  'app/routes/api/market/listings/$id/index.ts',
  'app/routes/api/messages/sidebar.ts',
  'app/routes/api/messages/unread-count.ts',
  'app/routes/api/moments/index.ts',
  'app/routes/api/news/approve.ts',
  'app/routes/api/news/reject.ts',
  'app/routes/api/personas/avatar/$filename.ts',
  'app/routes/api/predictions/$id/trade.ts',
  'app/routes/api/presence/online-count.ts',
  'app/routes/api/profile-links/reverify.ts',
  'app/routes/api/profile/avatar/$filename.ts',
  'app/routes/api/profile/banner/$filename.ts',
  'app/routes/api/pulse.ts',
  'app/routes/api/push/public-key.ts',
  'app/routes/api/ranked/$game/leaderboard.ts',
  'app/routes/api/ready.ts',
  'app/routes/api/replays/index.ts',
  'app/routes/api/rideshare/directions.ts',
  'app/routes/api/rideshare/geocode.ts',
  'app/routes/api/rideshare/reverse.ts',
  'app/routes/api/rmharks/$id/similar.ts',
  'app/routes/api/rmharks/$id/unlock.ts',
  'app/routes/api/rmharks/$id/view.ts',
  'app/routes/api/rmhbox/history.ts',
  'app/routes/api/rmhbox/leaderboard.ts',
  'app/routes/api/rmhbox/stats.ts',
  'app/routes/api/rmhladder/events.ts',
  'app/routes/api/rmhladder/resume/$id.ts',
  'app/routes/api/rmhladder/resume/$id/analyze.ts',
  'app/routes/api/rmhladder/resume/$id/confirm.ts',
  'app/routes/api/rmhladder/searches.ts',
  'app/routes/api/rmhtube/oembed.ts',
  'app/routes/api/shop/purchase.ts',
  'app/routes/api/spaces/$id/end.ts',
  'app/routes/api/spaces/$id/index.ts',
  'app/routes/api/spaces/$id/start.ts',
  'app/routes/api/spaces/index.ts',
  'app/routes/api/spaces/live.ts',
  'app/routes/api/staking/deposit.ts',
  'app/routes/api/staking/withdraw.ts',
  'app/routes/api/storefront/products/$id/buy.ts',
  'app/routes/api/streak.freeze.ts',
  'app/routes/api/tips/leaderboard.ts',
  'app/routes/api/tournaments/$id/cancel.ts',
  'app/routes/api/tournaments/$id/matches/$matchId/report.ts',
  'app/routes/api/tournaments/$id/register.ts',
  'app/routes/api/tournaments/$id/start.ts',
  'app/routes/api/tournaments/$id/withdraw.ts',
  'app/routes/api/user-builds/$id/unlock.ts',
  'app/routes/api/user-builds/$id/view.ts',
  'app/routes/api/users/search.ts',
  'app/routes/api/v1/openapi[.]json.ts',
  'app/routes/api/vibe/ai.ts',
  'app/routes/api/vibe/pkg/$file.ts',
  'app/routes/api/vibe/thumb/$slug.ts',
  'app/routes/api/wager/$id/accept.ts',
  'app/routes/api/wager/$id/cancel.ts',
  'app/routes/api/wager/$id/report.ts',
];

/**
 * Rule 2 backlog: route files that DO use a wrapper and still call
 * `auth.api.getSession` in the handler body.
 */
const KNOWN_BYPASSES_WRAPPER: readonly string[] = [
  'app/routes/api/ai/ask-feed.ts',
  'app/routes/api/ai/search.ts',
  'app/routes/api/ai/transform.ts',
  'app/routes/api/altair/meta.ts',
  'app/routes/api/altair/score.ts',
  'app/routes/api/coins/bet.ts',
  'app/routes/api/coins/claim.ts',
  'app/routes/api/coins/purchase.ts',
  'app/routes/api/creator/redeem/index.ts',
  'app/routes/api/daily-puzzles/results.ts',
  'app/routes/api/daily-puzzles/score.ts',
  'app/routes/api/doctrine/admin/disclosures.ts',
  'app/routes/api/doctrine/admin/incidents.ts',
  'app/routes/api/doctrine/admin/tiers.ts',
  'app/routes/api/doctrine/incidents/index.ts',
  'app/routes/api/doctrine/puzzles/replay.ts',
  'app/routes/api/doctrine/puzzles/submit.ts',
  'app/routes/api/doctrine/reactions.ts',
  'app/routes/api/doctrine/recruitment/create.ts',
  'app/routes/api/doctrine/recruitment/redeem.ts',
  'app/routes/api/doctrine/reputation/index.ts',
  'app/routes/api/doctrine/safehouse/content.ts',
  'app/routes/api/doctrine/safehouse/disclosures.ts',
  'app/routes/api/doctrine/sahur/status.ts',
  'app/routes/api/dream-rift/coop.ts',
  'app/routes/api/dream-rift/score.ts',
  'app/routes/api/events/$id/index.ts',
  'app/routes/api/events/$id/rsvp.ts',
  'app/routes/api/events/index.ts',
  'app/routes/api/feed/mention-search.ts',
  'app/routes/api/feedback.ts',
  'app/routes/api/games/$id.guides.ts',
  'app/routes/api/games/$id.reviews.ts',
  'app/routes/api/homes/listings.ts',
  'app/routes/api/laundry-sort/score.ts',
  'app/routes/api/library/collection/$id.ts',
  'app/routes/api/library/collection/$id/cover.ts',
  'app/routes/api/library/collection/$id/items.ts',
  'app/routes/api/library/collections.ts',
  'app/routes/api/market/listings/index.ts',
  'app/routes/api/profile/$id.ts',
  'app/routes/api/profile/$id/followers.ts',
  'app/routes/api/profile/$id/following.ts',
  'app/routes/api/profile/$id/likes.ts',
  'app/routes/api/profile/$id/rmharks.ts',
  'app/routes/api/replays/$id.ts',
  'app/routes/api/rideshare/driver.ts',
  'app/routes/api/rmharks.ts',
  'app/routes/api/rmharks/$id.ts',
  'app/routes/api/rmharks/$id/comment.ts',
  'app/routes/api/rmharks/$id/comment/$commentId/view.ts',
  'app/routes/api/rmharks/$id/summary.ts',
  'app/routes/api/rmharks/$id/translate.ts',
  'app/routes/api/rmhcalculator/compute.ts',
  'app/routes/api/rmhcalculator/graph.ts',
  'app/routes/api/rmhladder/resume/index.ts',
  'app/routes/api/signal-forge/abandon.ts',
  'app/routes/api/signal-forge/load.ts',
  'app/routes/api/signal-forge/save.ts',
  'app/routes/api/signal-forge/score.ts',
  'app/routes/api/studio/tiers.ts',
  'app/routes/api/tournaments/index.ts',
  'app/routes/api/user-builds.ts',
  'app/routes/api/user-builds/$id.ts',
  'app/routes/api/user-builds/$id/comments.ts',
  'app/routes/api/user-builds/$id/like.ts',
  'app/routes/api/user-builds/featured.ts',
  'app/routes/api/vega/score.ts',
  'app/routes/api/wager/index.ts',
];

const POINTER =
  'Wrap the handler in `defineHandler` from @/lib/api/handler.server — it is ' +
  'the only place the session → rate-limit → zod → try/catch order is written ' +
  'down (CLAUDE.md §3):\n' +
  "    POST: defineHandler({ rateLimit: 'write', body: schema }, async ({ userId, body }) => …)\n" +
  "  `auth` defaults to 'required'; pass 'admin' / 'optional' / 'none' to opt " +
  'out. Routes under /api/v1/** use `withDeveloperApi` instead (different error ' +
  'envelope). Do NOT add the file to the allowlist — the allowlist only shrinks.';

function report(label: string, files: string[], extra = ''): string {
  return `\n${label} (${files.length}):\n${files.map((f) => `  ${f}`).join('\n')}\n\n${POINTER}${extra}\n`;
}

describe('every API route rides the shared handler wrapper (D2)', () => {
  it('finds the API route tree at all', () => {
    // Guards the walker: a moved directory or a broken filter would make every
    // rule below pass vacuously against an empty set, and the allowlist
    // staleness test would then flag all 179 entries — a loud failure either
    // way, but this assertion says *why* in one line.
    expect(ROUTES.length).toBeGreaterThan(400);
    expect(ROUTES.map((r) => r.file)).toContain('app/routes/api/health.ts');
  });

  it('references defineHandler or withDeveloperApi', () => {
    const allow = new Set(KNOWN_UNWRAPPED);
    const offenders = ROUTES.filter((r) => !hasWrapper(r.src) && !allow.has(r.file)).map(
      (r) => r.file,
    );
    expect(offenders, report('API route with no handler wrapper', offenders)).toEqual([]);
  });

  it('does not reach past the wrapper for the session', () => {
    const allow = new Set(KNOWN_BYPASSES_WRAPPER);
    const offenders = ROUTES.filter(
      (r) => hasWrapper(r.src) && callsGetSession(r.src) && !allow.has(r.file),
    ).map((r) => r.file);
    expect(
      offenders,
      report(
        'Wrapped API route calling auth.api.getSession directly',
        offenders,
        '\n\n  A manual `getSession` inside a `defineHandler({ auth: "none" })` is ' +
          "the wrapper's own `auth: 'required'` (or `'optional'`, if the call is " +
          'wrapped in a try/catch that falls back to null) written out by hand — ' +
          'with the failure mode that the hand-written version forgets the catch ' +
          'and 500s the whole route when the session store hiccups.',
      ),
    ).toEqual([]);
  });
});

describe('the backlog only ever shrinks', () => {
  /**
   * Without this, an allowlist rots: routes get fixed, the entries stay, and a
   * year later nobody can tell which of the 179 names are real debt and which
   * are ghosts — so nobody deletes any of them and the list quietly becomes
   * permanent permission. Deleting the entry has to be part of fixing the file,
   * and the only way to make that happen is to fail the build when it isn't.
   */
  const byFile = new Map(ROUTES.map((r) => [r.file, r.src]));

  it('lists no route that no longer exists', () => {
    const gone = [...KNOWN_UNWRAPPED, ...KNOWN_BYPASSES_WRAPPER].filter((f) => !byFile.has(f));
    expect(
      gone,
      `\nAllowlisted routes that are no longer scanned (deleted, renamed, or no ` +
        `longer declaring a server handler):\n${gone.map((f) => `  ${f}`).join('\n')}\n\n` +
        `Remove them from KNOWN_UNWRAPPED / KNOWN_BYPASSES_WRAPPER.\n`,
    ).toEqual([]);
  });

  it('lists no route that has since been fixed', () => {
    const fixedUnwrapped = KNOWN_UNWRAPPED.filter((f) => {
      const src = byFile.get(f);
      return src !== undefined && hasWrapper(src);
    });
    const fixedBypass = KNOWN_BYPASSES_WRAPPER.filter((f) => {
      const src = byFile.get(f);
      return src !== undefined && !(hasWrapper(src) && callsGetSession(src));
    });
    const stale = [
      ...fixedUnwrapped.map((f) => `${f} — now uses a wrapper; drop it from KNOWN_UNWRAPPED`),
      ...fixedBypass.map(
        (f) => `${f} — no longer calls getSession; drop it from KNOWN_BYPASSES_WRAPPER`,
      ),
    ];
    expect(
      stale,
      `\nThe migration backlog is out of date:\n${stale.map((s) => `  ${s}`).join('\n')}\n\n` +
        `Deleting the entry is the last step of fixing the route. Leaving it ` +
        `behind is what turns a ratchet back into a rubber stamp.\n`,
    ).toEqual([]);
  });

  it('is sorted and free of duplicates', () => {
    // Purely mechanical, but it is what keeps a 179-line list reviewable in a
    // diff: an out-of-order insert hides in the noise, an alphabetical one does
    // not.
    for (const [name, list] of [
      ['KNOWN_UNWRAPPED', KNOWN_UNWRAPPED],
      ['KNOWN_BYPASSES_WRAPPER', KNOWN_BYPASSES_WRAPPER],
    ] as const) {
      expect(new Set(list).size, `${name} has duplicate entries`).toBe(list.length);
      expect([...list], `${name} is not alphabetically sorted`).toEqual(
        [...list].sort((a, b) => a.localeCompare(b)),
      );
    }
  });
});
