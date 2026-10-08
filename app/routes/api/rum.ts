import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { z } from 'zod';
import { classifyRumRoute, getRumRouteLabel, getRumThreshold } from '@/lib/rum-slo';

/**
 * POST /api/rum — sink for Core Web Vitals reports from `lib/rum.ts`.
 *
 * Accepts and validates every metric, emits a structured sample for aggregate
 * p75/p95 reporting, logs Web Vitals' own `poor` ratings, and emits a guardrail
 * warning when a route-class-specific SLO threshold is exceeded.
 *
 * The schema is the contract with a client that is **cached and therefore
 * older than this file**. Two rules follow from that and neither is optional:
 * every attribution field is `.optional()`, so a client that predates it still
 * validates; and no field is ever made required or narrowed after it ships,
 * because a rejected beacon is not a degraded sample — `defineHandler` 400s the
 * whole request, so one wrong constraint here silently zeroes out ALL RUM data
 * rather than just the new column.
 */

/** Retained length of a selector after normalization. */
const SELECTOR_MAX = 120;
/** Retained length of an attributed script URL. */
const SCRIPT_MAX = 200;
/** Retained length of the bfcache reason list. */
const REASONS_MAX = 200;

/**
 * A millisecond phase from an attribution object. Bounded by the same ceiling
 * as `value` so a hostile client cannot log an absurd number.
 */
const phase = z.number().nonnegative().max(300_000).optional();

/**
 * A free-form diagnostic string: a CSS selector, a script URL, a reason list.
 *
 * The ceiling is far above what `lib/rum.ts` sends (120–200) on purpose. It is
 * a hostile-payload bound, not the retention limit — a client one deploy out of
 * step must not have its beacons rejected for being 130 characters instead of
 * 120. Everything past the retention limit is truncated by the normalizers
 * below, which run before anything is logged.
 */
const diagnostic = z.string().max(2_000).optional();

export const MetricSchema = z.object({
  // `BFCACHE` is this codebase's own metric (OPT-31), not a Web Vitals one.
  name: z.enum(['LCP', 'INP', 'CLS', 'TTFB', 'FCP', 'BFCACHE']),
  value: z.number().nonnegative().max(300_000),
  rating: z.enum(['good', 'needs-improvement', 'poor']).optional(),
  id: z.string().max(64).optional(),
  navigationType: z.string().max(32).optional(),
  path: z.string().max(200).regex(/^\//).optional(),
  ts: z.string().max(40).optional(),
  /**
   * The SSR trace id the client read back off `Server-Timing`. The client only
   * beacons it when it already matches this shape, so the strict regex can only
   * ever reject a forged one.
   */
  traceId: z
    .string()
    .regex(/^[0-9a-f]{32}$/)
    .optional(),

  /* INP attribution — the phase breakdown plus what was interacted with. */
  inputDelay: phase,
  processingDuration: phase,
  presentationDelay: phase,
  target: diagnostic,
  script: diagnostic,

  /* LCP attribution — which element, and how its time split. */
  element: diagnostic,
  ttfb: phase,
  resourceLoadDelay: phase,
  resourceLoadDuration: phase,
  elementRenderDelay: phase,

  /* CLS attribution — what moved. */
  shifted: diagnostic,

  /* bfcache — the disqualifiers, comma-separated. */
  reasons: diagnostic,

  /* Device context — the dimension that makes a mobile-only regression
     visible instead of averaging it into a pooled percentile. Every field is
     bucketed client-side (`lib/rum.ts` §Device context) and re-bounded here,
     because the client is not trusted: an enum rejects a forged form factor
     outright, and the numeric caps stop a hostile beacon from opening a new
     time series per value. */
  formFactor: z.enum(['mobile', 'tablet', 'desktop']).optional(),
  vw: z.number().int().nonnegative().max(10_000).optional(),
  dpr: z.number().min(0).max(10).optional(),
  mem: z.number().min(0).max(1_024).optional(),
  cores: z.number().int().nonnegative().max(1_024).optional(),
  /* Not an enum: `effectiveType` is '4g' | '3g' | '2g' | 'slow-2g' today, but
     it is a living spec and a value this schema has not heard of must be
     logged as-is rather than 400 the whole beacon. Normalized before it is
     logged. */
  net: z.string().max(32).optional(),
  saveData: z.boolean().optional(),
});

export type RumMetricInput = z.infer<typeof MetricSchema>;

/**
 * Reduce a client selector to something groupable.
 *
 * Attribution selectors are DOM paths, and a path that embeds a row index or a
 * generated id is a *new time series per row and per id* — the 400th feed
 * card's like button would get its own line in the metrics store, which is the
 * failure mode that makes teams turn INP attribution back off. These
 * substitutions collapse the parts that vary per instance while keeping the
 * parts that identify the component, and then truncate: the client caps its
 * strings already, but the client is not trusted to.
 */
export function normalizeSelector(
  value: string | undefined,
  keep = SELECTOR_MAX,
): string | undefined {
  if (!value) return undefined;
  const normalized = value
    .replace(/\s+/g, ' ')
    .trim()
    // `:nth-child(37)` — position within a list, never the thing you fix.
    .replace(/:nth-(child|last-child|of-type|last-of-type)\(\s*\d+\s*\)/g, ':nth-$1(n)')
    // cuid/uuid/hash-shaped id and class tokens (`#post-clx8f9k2m0001`), kept
    // down to their stable stem (`#post-clx*`).
    .replace(/([#.][A-Za-z_-]*)[A-Za-z0-9_-]*\d[A-Za-z0-9]{7,}/g, '$1*')
    // plain numeric suffixes (`#item-42`, `.row2`).
    .replace(/([#.][A-Za-z_-]+)-?\d+\b/g, '$1*')
    .slice(0, keep);
  return normalized || undefined;
}

/**
 * Reduce an attributed script URL to an origin-free, hash-free path.
 *
 * The origin is always ours and the content hash changes every deploy, so
 * keeping either would make "which script is slow" unanswerable across two
 * releases.
 */
export function normalizeScript(value: string | undefined): string | undefined {
  if (!value) return undefined;
  let out = value.trim();
  if (!out) return undefined;
  try {
    // The base makes a relative `sourceURL` parse too; the origin is discarded
    // either way, along with any query string and fragment.
    out = new URL(out, 'https://rmhstudios.com').pathname;
  } catch {
    /* not a URL — an inline or eval'd script; the raw string is still a hint */
  }
  return out.replace(/-[A-Za-z0-9_]{8,}(\.[a-z]+)$/, '-*$1').slice(0, SCRIPT_MAX) || undefined;
}

/**
 * Reduce a bfcache reason list to a sorted set of the tokens Chrome actually
 * emits. Already low-cardinality by construction; this exists so a forged
 * beacon cannot smuggle arbitrary text into the log line.
 */
export function normalizeReasons(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const tokens = value
    .split(',')
    .map((token) =>
      token
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, ''),
    )
    .filter(Boolean);
  return [...new Set(tokens)].sort().join(',').slice(0, REASONS_MAX) || undefined;
}

/**
 * Reduce `navigator.connection.effectiveType` to a lowercase token.
 *
 * The schema accepts any short string (the spec can add values), so this is
 * what keeps the logged field low-cardinality: anything that is not one of the
 * four shipped tokens is collapsed to `other` rather than becoming its own
 * series. `undefined` stays `undefined` — "not reported" and "reported as
 * something unfamiliar" are different facts.
 */
const EFFECTIVE_TYPES = new Set(['slow-2g', '2g', '3g', '4g']);

export function normalizeEffectiveType(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const token = value.trim().toLowerCase();
  if (!token) return undefined;
  return EFFECTIVE_TYPES.has(token) ? token : 'other';
}

export const Route = createFileRoute('/api/rum')({
  server: {
    handlers: {
      POST: defineHandler(
        {
          auth: 'none',
          rateLimit: { limit: 60, windowMs: 60_000, prefix: 'rum' },
          body: MetricSchema,
        },
        async ({ body: m }) => {
          const routeClass = classifyRumRoute(m.path);
          // `BFCACHE` has no SLO band, so this is `null` for it and `sloBreach`
          // stays false — the same path every unbanded metric takes.
          const threshold = getRumThreshold(routeClass, m.name);
          const sloBreach = threshold != null && m.value > threshold;
          const metric = {
            name: m.name,
            value: m.value,
            rating: m.rating,
            threshold,
            sloBreach,
            route: getRumRouteLabel(m.path),
            routeClass,
            navigationType: m.navigationType,
            traceId: m.traceId,
            clientTs: m.ts,
            receivedAt: new Date().toISOString(),
            // Attribution. Every field is `undefined` unless the client sent it
            // and `JSON.stringify` drops those, so a TTFB line stays as short as
            // it was and only the metric that has a diagnosis carries one.
            inputDelay: m.inputDelay,
            processingDuration: m.processingDuration,
            presentationDelay: m.presentationDelay,
            target: normalizeSelector(m.target),
            script: normalizeScript(m.script),
            element: normalizeSelector(m.element),
            ttfb: m.ttfb,
            resourceLoadDelay: m.resourceLoadDelay,
            resourceLoadDuration: m.resourceLoadDuration,
            elementRenderDelay: m.elementRenderDelay,
            shifted: normalizeSelector(m.shifted),
            reasons: normalizeReasons(m.reasons),
            // Device context. Absent for any client cached from before this
            // shipped, which is why the reporter treats a missing form factor
            // as its own `unknown` bucket rather than dropping the sample.
            formFactor: m.formFactor,
            vw: m.vw,
            dpr: m.dpr,
            mem: m.mem,
            cores: m.cores,
            net: normalizeEffectiveType(m.net),
            saveData: m.saveData,
          };

          // Every valid sample is emitted so the log pipeline can calculate p75
          // and p95 by route class. Warning events remain easy to alert on without
          // treating a single slow navigation as an aggregate percentile.
          // eslint-disable-next-line no-console -- normal metrics are informational, not warnings
          console.info('[rum:metric]', JSON.stringify(metric));
          if (m.rating === 'poor') {
            console.warn('[rum:poor]', JSON.stringify(metric));
          }
          if (sloBreach) {
            console.warn('[rum:slo-breach]', JSON.stringify(metric));
          }

          return new Response(null, { status: 204 });
        },
      ),
    },
  },
});
