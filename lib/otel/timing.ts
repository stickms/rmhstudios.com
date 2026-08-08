/**
 * `Server-Timing` phase durations (OPT-49).
 *
 * ## What problem this solves
 *
 * RUM reports TTFB as a single number. When it regresses, nothing in the data
 * says whether the extra 200 ms went to the session lookup, a loader, a cache
 * miss, the database or the render — so every investigation starts by adding
 * temporary logging to find out, and ends by removing it again. These entries
 * make that decomposition a permanent property of every response: DevTools
 * shows the phases under the document's Timing tab, and `lib/rum.ts` reads the
 * same header for its own navigation.
 *
 * ## One context, not two
 *
 * The durations live on the `TraceScope` that `lib/otel/trace.ts` already
 * carries in an `AsyncLocalStorage`. That is the point: a second store would
 * cost a second per-request context and could drift out of step with the trace
 * id at exactly the moments a timing needs one to be actionable. This module
 * owns the *semantics* (which phases exist, how they are named, how they are
 * rendered into a header); `trace.ts` owns the storage.
 *
 * ## Security: this header is public
 *
 * `Server-Timing` is readable by any same-origin script and is visible to
 * anyone with DevTools. So phase entries carry **`dur` only, never `desc`** —
 * no user ids, no query text, no key names, no internal hostnames. `mark()`
 * takes a duration and a name from a fixed vocabulary, and a name outside that
 * vocabulary's character set is DROPPED rather than sanitised into something
 * adjacent: a name is header syntax, and `db;dur=1, x;desc="…"` is a header
 * injection if the name is ever allowed to carry `;`, `,` or `"`.
 *
 * ## Where the phases are marked
 *
 * `total` is marked by `server/nitro/otel.ts`, which is the only phase a Nitro
 * plugin can see: this Nitro exposes four runtime hooks (`close`, `error`,
 * `request`, `response`) and none of them brackets a loader or a render. Every
 * other phase is one `mark()`/`measure()` call inside the layer that owns it:
 *
 *   `sess`   `lib/api/handler.server.ts` — around the `auth.api.getSession`
 *            call in the `defineHandler` step 1 block; and
 *            `lib/auth-session.server.ts#getRequestSession`, around the
 *            `auth.api.getSession` promise it memoizes (the SSR path — the
 *            anonymous fast path returns before it and should stay unmarked).
 *   `cache`  `lib/cached.server.ts#cached` — around the whole body, so an L1
 *            hit reports as the ~0 ms it is and a miss carries the loader.
 *   `db`     `lib/prisma.server.ts` — the `$allOperations` hook of
 *            `queryBudgetExtension`, which already wraps every query.
 *   `loader` a route loader wrapper; there is no single choke point today.
 *   `render` `app/server.ts` (does not exist yet — TanStack Start falls back to
 *            its default entry) wrapping `defaultStreamHandler`, which runs
 *            after the router has loaded and is therefore render-only.
 *
 * An unmarked phase is simply absent from the header — never zero — so partial
 * adoption reads honestly in DevTools and in RUM.
 *
 * NOTE for the `db` call site: `lib/prisma.server.ts` is bundled into the
 * standalone Node services by esbuild, whose build context is `server/` + `lib/`
 * — so importing this module from there resolves with no Dockerfile change.
 * (It used to need a matching `COPY lib/otel ./lib/otel/` in the `server-builder`
 * stage, back when that stage copied a curated per-module subset of `lib/`.)
 * `lib/__tests__/server-bundle-copies.test.ts` still walks the import graph and
 * fails the build on anything reached OUTSIDE those two trees; see
 * `server/CLAUDE.md` gotchas 7 and 8 for why that failure mode is a service
 * that dies on boot rather than a build error.
 *
 * @see server/nitro/otel.ts — opens the scope, marks `total`, sends the header
 * @see lib/otel/trace.ts — the scope this writes into
 * @see docs/optimization-ideas-2026-08-05.md OPT-49
 */

import { currentScope, serverTimingTrace, type TraceScope } from './trace';

/**
 * The phases that compose TTFB on this site.
 *
 * Short because the header is sent on every response, and stable because each
 * name becomes a RUM series the moment it is aggregated — renaming one splits
 * its history in two.
 *
 *   `sess`   — the Better Auth session lookup
 *   `loader` — route loader execution
 *   `cache`  — time inside `cached()` (L1 + L2), miss path included
 *   `db`     — cumulative Prisma query time
 *   `render` — React SSR
 *   `total`  — the whole server-side handling, marked by the Nitro plugin
 */
export const PHASES = ['sess', 'loader', 'cache', 'db', 'render', 'total'] as const;

export type PhaseName = (typeof PHASES)[number];

/**
 * Metric names that may appear in the header.
 *
 * The RFC's grammar for a metric name is an HTTP token, which permits far more
 * than this. The narrower rule is on purpose: everything that reaches here is
 * code-supplied, so anything outside `[a-z0-9_-]` is a bug or an injection
 * attempt, and there is no third case worth accommodating.
 */
const NAME_RE = /^[a-z][a-z0-9_-]{0,15}$/;

/**
 * How many distinct phases one response may report.
 *
 * A guard against a call site that marks per-query or per-key names: that would
 * turn a fixed-size header into an unbounded one on the hottest path in the
 * app. Comfortably above `PHASES.length` so a deliberate one-off addition
 * doesn't silently vanish.
 */
const MAX_PHASES = 12;

/** Above this, the number is a bug (a clock jump, a scope reused across requests). */
const MAX_DURATION_MS = 600_000;

/**
 * Add `ms` to `name` on an explicit scope.
 *
 * Additive, because `db` and `cache` are sums over many calls within one
 * request — `set` would report only the last query. Silently ignores anything
 * it cannot represent: telemetry that throws is worse than telemetry that is
 * missing, and this sits on the request path.
 */
export function markScope(scope: TraceScope | undefined, name: string, ms: number): void {
  if (!scope) return;
  if (!NAME_RE.test(name)) return;
  if (typeof ms !== 'number' || !Number.isFinite(ms)) return;
  // Clamped, not dropped: a phase that measures a hair below zero (coarse
  // timers, a clock adjustment mid-request) is still a real "0 ms".
  const clamped = Math.min(Math.max(ms, 0), MAX_DURATION_MS);
  const existing = scope.timings.get(name);
  if (existing === undefined && scope.timings.size >= MAX_PHASES) return;
  scope.timings.set(name, (existing ?? 0) + clamped);
}

/**
 * Add `ms` to `name` on the ambient request scope.
 *
 * **This is the API for call sites.** A no-op outside a traced scope — which is
 * the common case for workers, scripts and tests — so it is safe to call
 * unconditionally from shared code that runs in both places.
 */
export function mark(name: PhaseName | string, ms: number): void {
  markScope(currentScope(), name, ms);
}

/**
 * Time `fn` and mark it as `name`.
 *
 * The scope is captured BEFORE the call, not inside the `finally`: an async
 * continuation can resume in a different context, and a duration attributed to
 * the wrong request is worse than no duration at all. Marks on the failure path
 * too — a phase that threw after 3 seconds is exactly the one worth seeing.
 */
export async function measure<T>(name: PhaseName | string, fn: () => Promise<T>): Promise<T> {
  const scope = currentScope();
  if (!scope) return fn();
  const started = performance.now();
  try {
    return await fn();
  } finally {
    markScope(scope, name, performance.now() - started);
  }
}

/** One entry's rendering. One decimal place: sub-0.1 ms precision is noise here. */
function entry(name: string, ms: number): string {
  return `${name};dur=${ms.toFixed(1)}`;
}

/**
 * The phase entries for a scope, in a stable order.
 *
 * Known phases first, in `PHASES` order, then anything else in the order it was
 * marked. Insertion order alone would make the header's shape depend on which
 * layer happened to run first, which is noise in a diff and in a test.
 */
export function serverTimingPhases(scope: TraceScope | undefined): string[] {
  if (!scope || scope.timings.size === 0) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const name of PHASES) {
    const ms = scope.timings.get(name);
    if (ms === undefined) continue;
    seen.add(name);
    out.push(entry(name, ms));
  }
  for (const [name, ms] of scope.timings) {
    if (seen.has(name)) continue;
    // Re-checked rather than trusted: `timings` is a plain Map on a shared
    // object, and this function is the last thing between it and the wire.
    if (!NAME_RE.test(name) || !Number.isFinite(ms)) continue;
    out.push(entry(name, ms));
  }
  return out;
}

/**
 * The complete `Server-Timing` value for a request: trace id, then phases.
 *
 * Composed here rather than appended separately so the response carries ONE
 * `Server-Timing` header instead of two. The trace entry stays first because
 * `lib/rum.ts` looks it up by name on every navigation and a header that starts
 * with the thing everyone reads is cheaper to reason about in DevTools.
 */
export function serverTimingHeader(scope: TraceScope | undefined): string {
  if (!scope) return '';
  return [serverTimingTrace(scope.span), ...serverTimingPhases(scope)].join(', ');
}
