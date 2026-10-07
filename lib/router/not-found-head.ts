/**
 * Make the client build the same `<head>` as the server for a 404 thrown by a
 * nested route.
 *
 * ## The bug this works around
 *
 * When a loader throws `notFound()`, TanStack's server-side `loadMatches` walks
 * up to the nearest route with a `notFoundComponent` — the "boundary", which is
 * the root for most of this site — and runs `head()` only for the matches up to
 * and including it (`headMaxIndex` in `router-core/load-matches`). The client's
 * `hydrate()` (`router-core/ssr/ssr-client`) does not apply that cut: it runs
 * `head()` and `scripts()` for EVERY matched route. So the two sides render
 * different `<head>`s whenever a route between the boundary and the thrower
 * contributes a `<script>`.
 *
 * Meta, title and links are hoisted by React and do not care about position;
 * an inline `<script>` is hydrated in place. Measured on
 * `/slice-it/player/<unknown handle>`: the Slice It layout's deferred-font
 * script exists only on the client, React throws #418 on every load, and with
 * no Suspense boundary between the mismatch and the document it re-renders the
 * WHOLE document — and React 19 resets `<html>`'s attributes to its props when
 * it does, wiping every class, `data-*` attribute and inline style the
 * pre-paint scripts set. The page lost its theme class, its app ground and its
 * `color-scheme` two seconds after it had painted correctly
 * (docs/fouc-audit-2026-10-06.md §7).
 *
 * ## The fix
 *
 * {@link installNotFoundHeadGuard} wraps every route's `head` and `scripts` so
 * that a match PAST the not-found boundary contributes nothing — the server's
 * rule, applied on the client. It is a no-op for every load that is not a 404,
 * and on the server, which never calls these functions past the boundary.
 */

/** The fields of a router match this reads. */
interface MatchLike {
  index: number;
  status?: string;
  globalNotFound?: boolean;
}

/**
 * The index of the match that renders a not-found, or `-1` if none does.
 *
 * Mirrors how `load-matches` marks it: a ROOT boundary is left `success` with
 * `globalNotFound: true`; any other boundary gets `status: 'notFound'`. The
 * thrower is also `notFound`, but it is never above its own boundary, so the
 * lowest index is the boundary either way.
 */
export function notFoundBoundaryIndex(matches: readonly MatchLike[]): number {
  for (const m of matches) {
    if (m.globalNotFound || m.status === 'notFound') return m.index;
  }
  return -1;
}

/** Whether `match` sits below the not-found boundary — i.e. the server skipped its head. */
export function isPastNotFoundBoundary(matches: readonly MatchLike[], match: MatchLike): boolean {
  const boundary = notFoundBoundaryIndex(matches);
  return boundary !== -1 && match.index > boundary;
}

type AssetFn = (ctx: { matches: MatchLike[]; match: MatchLike }) => unknown;

interface RouteLike {
  options: { head?: AssetFn; scripts?: AssetFn };
}

const GUARDED = Symbol.for('rmh.notFoundHeadGuard');

/**
 * Wrap each route's `head`/`scripts` once. Idempotent — `getRouter()` can run
 * more than once per page, and the route objects are module singletons, so a
 * second call must not stack a second wrapper on the first.
 */
export function installNotFoundHeadGuard(routesById: Record<string, unknown>): void {
  for (const route of Object.values(routesById) as RouteLike[]) {
    const options = route?.options;
    if (!options) continue;
    for (const key of ['head', 'scripts'] as const) {
      const fn = options[key];
      if (typeof fn !== 'function' || (fn as { [GUARDED]?: true })[GUARDED]) continue;
      const guarded: AssetFn = (ctx) =>
        ctx &&
        Array.isArray(ctx.matches) &&
        ctx.match &&
        isPastNotFoundBoundary(ctx.matches, ctx.match)
          ? undefined
          : fn(ctx);
      (guarded as { [GUARDED]?: true })[GUARDED] = true;
      options[key] = guarded;
    }
  }
}
