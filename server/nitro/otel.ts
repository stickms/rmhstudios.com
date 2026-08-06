// Nitro startup plugin — trace correlation for the web tier (E1).
//
// WHAT IT DOES, precisely:
//   1. Adopts the inbound `traceparent` (or mints a root span) for every
//      request, and binds it to the request's async context so any code
//      downstream can call `currentTraceId()` without threading an argument
//      through forty call sites.
//   2. Echoes the trace id back as `Server-Timing: trace;desc="<id>"`, which is
//      the ONE response header a page can read for its own navigation from
//      JavaScript — that is how `lib/rum.ts` stamps the beacon with the id the
//      server used, with no meta tag and no inline script.
//   3. Sends the request's phase durations (OPT-49) in that same header, so a
//      TTFB regression can be attributed instead of investigated. See the
//      "WHICH PHASES ARE LIVE" note below — the plugin marks `total` itself and
//      the rest arrive from `mark()` call sites inside the layers they measure.
//   4. Opens the per-request query budget (E3) and closes it on response, so a
//      request that issues an absurd number of queries names itself in the log.
//   5. Tags the 500-path log line with the trace id.
//
// WHICH PHASES ARE LIVE: `total` (request hook → response hook) is marked here
// and needs nothing from anyone. `sess` / `loader` / `cache` / `db` / `render`
// cannot be seen from a Nitro plugin — this Nitro exposes exactly four runtime
// hooks (`close`, `error`, `request`, `response`; see `NitroRuntimeHooks`), so
// there is no seam here around a loader or a render. Each of those is one
// `mark()` call inside the layer that owns it; until those land, the header
// carries `trace` + `total` and nothing is silently wrong — an absent phase is
// absent, not zero. The call sites are listed in `lib/otel/timing.ts`.
//
// WHAT IT IS NOT: the OpenTelemetry SDK. `@opentelemetry/*` is not in
// package.json and adding ~40 transitive packages plus a collector to get a
// correlation id is the wrong trade at this size. `lib/otel/trace.ts` speaks the
// same W3C header, so dropping the real SDK in later is additive rather than a
// rewrite — see that file's header for the argument in full.
//
// Registered in vite.config.ts under nitro({ plugins: [...] }), the same way
// warmup.ts and security-headers.ts are.
//
// SAFETY: every step is wrapped and swallowed. Telemetry that can 500 a page is
// worse than no telemetry, and this runs on every request.
//
// Imports are RELATIVE, not `@/` aliased — Nitro plugin modules don't reliably
// resolve the tsconfig path aliases (same reason as warmup.ts / drain.ts).

import { markScope, serverTimingHeader } from '../../lib/otel/timing';
import { enterTrace, spanFromHeader, type TraceScope } from '../../lib/otel/trace';

/** The subset of Nitro's HTTPEvent this plugin touches. */
interface TracedEvent {
  req?: { url?: string; method?: string; headers?: { get?: (name: string) => string | null } };
  res?: { headers?: Headers };
}

interface NitroAppLike {
  hooks: {
    hook: (name: string, fn: (...args: never[]) => void | Promise<void>) => void;
  };
}

/**
 * The trace scope — ids plus phase durations — for an in-flight request.
 *
 * A WeakMap rather than a property on the event: the event object belongs to
 * h3, stamping our own keys onto it invites a collision, and a WeakMap needs no
 * cleanup — the entry disappears with the event.
 *
 * It is also what makes the response side correct. The `request` hook binds the
 * scope to the async context with `enterWith`, but by the time the `response`
 * hook runs we may no longer be in that context; holding the same scope OBJECT
 * here means the durations marked downstream (which mutate `scope.timings` in
 * place) are the ones read out below, whatever the ambient context says.
 */
const scopes = new WeakMap<object, TraceScope>();

/**
 * The query-budget API, loaded lazily.
 *
 * `lib/prisma.server.ts` THROWS at module scope when DATABASE_URL is unset, and
 * a Nitro plugin that throws at import time takes the whole worker down — so a
 * static import here would turn a missing env var into a boot loop instead of
 * the (already handled) first-query failure. Loaded asynchronously instead;
 * until it resolves, requests are traced but not budgeted. warmup.ts imports
 * the same module at boot, so the window is microseconds wide.
 */
type BudgetApi = typeof import('../../lib/prisma.server');
let budgetApi: BudgetApi | null = null;

/** Budgets are keyed by event too, so the response hook reads the right one. */
const budgets = new WeakMap<object, ReturnType<BudgetApi['enterQueryBudget']>>();

/**
 * A low-cardinality label for the budget line.
 *
 * The full path would put every post id and every handle in the log and make
 * grouping impossible; the first two segments are enough to say WHICH surface
 * ran 400 queries. Mirrors what `lib/rum-slo.ts` does for RUM route labels.
 */
function routeLabel(rawUrl: string | undefined, method: string | undefined): string {
  let path = '/';
  try {
    path = rawUrl ? new URL(rawUrl, 'http://localhost').pathname : '/';
  } catch {
    path = '/';
  }
  const segments = path.split('/').filter(Boolean).slice(0, 2);
  return `${method ?? 'GET'} /${segments.join('/')}`;
}

export default function otelPlugin(nitroApp: NitroAppLike): void {
  void import('../../lib/prisma.server')
    .then((mod) => {
      budgetApi = mod;
    })
    .catch(() => {
      // No budgeting. Tracing is unaffected.
    });

  nitroApp.hooks.hook('request', ((event: TracedEvent) => {
    try {
      const span = spanFromHeader(event.req?.headers?.get?.('traceparent') ?? null);
      // `enterTrace` (enterWith), not `withTrace`: a hook has no continuation to
      // wrap — Nitro calls us and then carries on itself. See lib/otel/trace.ts.
      // It returns the scope it entered, which is also the timing bag: its
      // `startedAt` is the origin the `total` phase is measured from.
      scopes.set(event as object, enterTrace(span));

      if (budgetApi) {
        budgets.set(
          event as object,
          budgetApi.enterQueryBudget(routeLabel(event.req?.url, event.req?.method)),
        );
      }
    } catch {
      // Never let correlation break a request.
    }
  }) as (...args: never[]) => void);

  nitroApp.hooks.hook('response', ((_res: Response, event: TracedEvent) => {
    try {
      const scope = scopes.get(event as object);
      if (scope) {
        // The one phase observable from here: everything Nitro did for this
        // request. Marked before the header is composed, so it is always the
        // last entry and always present — a response with `total` but no other
        // phase means the call sites below it haven't landed, not that they
        // took no time.
        markScope(scope, 'total', performance.now() - scope.startedAt);

        const headers = event.res?.headers ?? (_res as { headers?: Headers } | undefined)?.headers;
        // `append`, not `set`: Server-Timing is a list header and a route may
        // already have added its own timing entries. One append rather than one
        // per phase — `serverTimingHeader` composes the whole list value.
        headers?.append?.('Server-Timing', serverTimingHeader(scope));
      }

      const budget = budgets.get(event as object);
      if (budget && budgetApi) budgetApi.reportQueryBudget(budget);
    } catch {
      // Never let correlation break a response.
    }
  }) as (...args: never[]) => void);

  // The 500 path. `lib/api/handler.server.ts` owns the API error envelope; this
  // is the tier below it — anything that escapes a route entirely — and is the
  // one place a trace id can be attached to it without touching that wrapper.
  nitroApp.hooks.hook('error', ((error: unknown, ctx: { event?: TracedEvent }) => {
    try {
      const span = ctx?.event ? scopes.get(ctx.event as object)?.span : undefined;
      if (!span) return;
      console.error(
        '[trace:error]',
        JSON.stringify({
          traceId: span.traceId,
          spanId: span.spanId,
          route: routeLabel(ctx.event?.req?.url, ctx.event?.req?.method),
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    } catch {
      // Logging the error must not become the error.
    }
  }) as (...args: never[]) => void);
}
