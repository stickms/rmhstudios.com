/**
 * W3C Trace Context — a dependency-free correlation layer (E1).
 *
 * ## Why this is not the OpenTelemetry SDK
 *
 * The E1 spec sketches `@opentelemetry/sdk-node` with HTTP/PG/Undici
 * instrumentation. That is ~40 transitive packages, a collector to run, and a
 * vendor decision — none of which is installed here, and none of which is the
 * part that actually pays. The part that pays is the **id**: one value that
 * appears in the SSR log line, the socket hub's log line, the Go worker's log
 * line and the RUM beacon, so "it was slow at 14:02" becomes one grep instead
 * of four. That is what this module is: parse/format `traceparent`, mint ids,
 * carry one span context per request in an `AsyncLocalStorage`, and hand the
 * loggers a `{ traceId, spanId }` pair.
 *
 * Wiring the real SDK on top later is additive — it speaks the same W3C header,
 * so an inbound `traceparent` minted by a collector-instrumented service is
 * adopted here (`remote: true`) rather than replaced, and the ids we mint are
 * valid OTel ids that a collector will accept.
 *
 * ## Server-only by construction
 *
 * `node:async_hooks` makes this unimportable from client code. That is
 * deliberate and load-bearing: the browser half of the correlation
 * (`lib/rum.ts`) re-reads the trace id out of the `Server-Timing` response
 * header instead of importing anything from here, so no bundle ever pulls this
 * file in. It is NOT named `*.server.ts` because it carries the pure
 * parse/format helpers the tests exercise directly; treat the filename as a
 * convention exception, not a licence to import it from a component.
 *
 * ## What rides along
 *
 * The request-scoped store here is a `TraceScope`, not a bare `SpanContext`:
 * the ids plus a mutable bag of phase durations (`lib/otel/timing.ts`, OPT-49).
 * One `AsyncLocalStorage` carries both on purpose — a second one for timings
 * would double the per-request context cost and, worse, could drift out of
 * step with this one at exactly the moments (early returns, error paths) where
 * a timing needs its trace id to mean anything.
 *
 * @see server/nitro/otel.ts — the one place that starts a request span
 * @see lib/otel/timing.ts — the phase durations that share this scope
 * @see docs/performance-slo.md §Trace correlation
 */

import { AsyncLocalStorage } from 'node:async_hooks';

/** A W3C trace-context span: the ids that travel on the wire. */
export interface SpanContext {
  /** 32 lowercase hex chars, never all-zero. */
  traceId: string;
  /** 16 lowercase hex chars, never all-zero. */
  spanId: string;
  /** The `trace-flags` byte. Bit 0 (`0x01`) is "sampled". */
  flags: number;
  /** True when these ids arrived on an inbound `traceparent` rather than minted here. */
  remote: boolean;
}

/** `trace-flags` bit 0 — the caller recorded this trace. */
export const FLAG_SAMPLED = 0x01;

/** The only `traceparent` version this parser accepts (`00`). */
const VERSION = '00';

/**
 * `version-traceId-spanId-flags`, all lowercase hex.
 *
 * Version `ff` is invalid per spec, and the all-zero trace/span ids are the
 * spec's explicit "invalid" sentinels — a header carrying either is worse than
 * no header, because it correlates every request to the same id.
 */
const TRACEPARENT_RE = /^([0-9a-f]{2})-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/;
const INVALID_TRACE_ID = '0'.repeat(32);
const INVALID_SPAN_ID = '0'.repeat(16);

const HEX = '0123456789abcdef';

/** Lowercase hex for `bytes` random bytes, via Web Crypto (no `node:crypto`). */
function randomHex(bytes: number): string {
  const buf = new Uint8Array(bytes);
  globalThis.crypto.getRandomValues(buf);
  let out = '';
  for (const b of buf) out += HEX[b >> 4] + HEX[b & 0x0f];
  return out;
}

/** A fresh 128-bit trace id. */
export function newTraceId(): string {
  let id = randomHex(16);
  // Astronomically unlikely, but an all-zero id is the spec's "invalid"
  // sentinel and would silently merge every trace that drew it.
  while (id === INVALID_TRACE_ID) id = randomHex(16);
  return id;
}

/** A fresh 64-bit span id. */
export function newSpanId(): string {
  let id = randomHex(8);
  while (id === INVALID_SPAN_ID) id = randomHex(8);
  return id;
}

/**
 * Parse an inbound `traceparent` header.
 *
 * Returns `null` for anything malformed, for version `ff`, and for the invalid
 * all-zero ids — the caller then mints a fresh root span. Unknown FUTURE
 * versions are also rejected here rather than best-effort-parsed: this repo has
 * no upstream emitting them, so accepting a shape we have never seen is more
 * likely to import garbage than to preserve a real trace.
 */
export function parseTraceparent(header: string | null | undefined): SpanContext | null {
  if (!header) return null;
  const match = TRACEPARENT_RE.exec(header.trim().toLowerCase());
  if (!match) return null;

  const [, version, traceId, spanId, flags] = match;
  if (version !== VERSION) return null;
  if (traceId === INVALID_TRACE_ID || spanId === INVALID_SPAN_ID) return null;

  return { traceId, spanId, flags: parseInt(flags, 16), remote: true };
}

/** Serialise a span context as a `traceparent` header value. */
export function formatTraceparent(span: SpanContext): string {
  const flags = (span.flags & 0xff).toString(16).padStart(2, '0');
  return `${VERSION}-${span.traceId}-${span.spanId}-${flags}`;
}

/**
 * Start a span.
 *
 * With a parent, this is a CHILD: same trace id, new span id, inherited flags —
 * which is what continues an inbound request's trace. Without one it is a fresh
 * sampled root.
 */
export function startSpan(parent?: SpanContext | null): SpanContext {
  if (parent) {
    return {
      traceId: parent.traceId,
      spanId: newSpanId(),
      flags: parent.flags,
      remote: false,
    };
  }
  return { traceId: newTraceId(), spanId: newSpanId(), flags: FLAG_SAMPLED, remote: false };
}

/**
 * Continue an inbound request's trace, or start one.
 *
 * The single entry point a transport (HTTP handler, socket middleware, job
 * consumer) should call with whatever `traceparent` it received.
 */
export function spanFromHeader(header: string | null | undefined): SpanContext {
  return startSpan(parseTraceparent(header));
}

/**
 * Everything one traced unit of work carries: the ids, and what it spent.
 *
 * `span` is immutable — it is what goes on the wire. `timings` is deliberately
 * mutable and shared by reference, because the whole point is that a layer deep
 * inside a request (a Prisma extension, `cached()`) can add to it without
 * threading a parameter through every frame between there and the response
 * hook that reads it.
 */
export interface TraceScope {
  /** The ids for this unit of work. */
  span: SpanContext;
  /** Phase name → accumulated milliseconds. Written via `lib/otel/timing.ts`. */
  timings: Map<string, number>;
  /** `performance.now()` when the scope opened — the origin for the total. */
  startedAt: number;
}

/** A fresh scope around `span`, with no phases recorded yet. */
export function newScope(span: SpanContext): TraceScope {
  return { span, timings: new Map(), startedAt: performance.now() };
}

const storage = new AsyncLocalStorage<TraceScope>();

/**
 * Run `fn` inside a span.
 *
 * Called with just a function, it mints a fresh root span first — the shape the
 * workers want (`withTrace(() => runTick())`). Called with a span, it adopts
 * that one, which is how a request handler continues an inbound trace.
 */
export function withTrace<T>(fn: () => T): T;
export function withTrace<T>(span: SpanContext, fn: () => T): T;
export function withTrace<T>(spanOrFn: SpanContext | (() => T), maybeFn?: () => T): T {
  const span = typeof spanOrFn === 'function' ? startSpan() : spanOrFn;
  const fn = typeof spanOrFn === 'function' ? spanOrFn : maybeFn!;
  return storage.run(newScope(span), fn);
}

/**
 * Bind the current async context to `span` without wrapping a callback.
 *
 * For hook-shaped hosts that hand you a "request started" callback and then
 * carry on themselves — Nitro's `request` hook is exactly that, so there is no
 * continuation for `withTrace` to wrap. `enterWith` binds the store to the
 * current async resource and everything downstream inherits it.
 *
 * Prefer `withTrace` wherever a continuation exists: `enterWith` leaves the
 * store attached to whatever async resource happened to be current, so it can
 * outlive the request it was set for. That is tolerable for a correlation id
 * (a stale id mislabels a log line) and would NOT be for anything
 * authorisation-shaped.
 *
 * Returns the scope it entered, so a hook-shaped host can hold onto it for the
 * response side without a second lookup — the same shape as
 * `enterQueryBudget()` in `lib/prisma.server.ts`, and for the same reason: by
 * the time the response hook runs, the async context may no longer be ours.
 */
export function enterTrace(span: SpanContext): TraceScope {
  const scope = newScope(span);
  storage.enterWith(scope);
  return scope;
}

/** The scope for the current async context, if one was entered. */
export function currentScope(): TraceScope | undefined {
  return storage.getStore();
}

/** The span for the current async context, if one was entered. */
export function currentSpan(): SpanContext | undefined {
  return storage.getStore()?.span;
}

/** The current trace id, or `undefined` outside any traced scope. */
export function currentTraceId(): string | undefined {
  return storage.getStore()?.span.traceId;
}

/**
 * Trace fields to splat into a structured log entry.
 *
 * Empty outside a traced scope, so `{ ...traceFields(), event: 'x' }` is safe
 * everywhere and never emits `traceId: undefined` keys into the log stream.
 */
export function traceFields(): { traceId?: string; spanId?: string } {
  const span = storage.getStore()?.span;
  return span ? { traceId: span.traceId, spanId: span.spanId } : {};
}

/**
 * Headers that propagate the current trace to a downstream service.
 *
 * Each outbound call gets its own child span id so the downstream service's
 * span has a distinct parent — the same thing an instrumented HTTP client would
 * do. Empty outside a traced scope.
 */
export function traceHeaders(): Record<string, string> {
  const span = storage.getStore()?.span;
  if (!span) return {};
  return { traceparent: formatTraceparent(startSpan(span)) };
}

/**
 * The `Server-Timing` value that carries the trace id to the browser.
 *
 * `Server-Timing` is the one response header a page can read back from
 * JavaScript for its OWN navigation (via `PerformanceNavigationTiming
 * .serverTiming`), which is what lets `lib/rum.ts` stamp the beacon with the
 * server's trace id without a meta tag, an inline script, or an import of this
 * module. The name is short because the header is sent on every response.
 *
 * This is ONE entry in a list header. The phase durations (`lib/otel/timing.ts`)
 * ride in the same header beside it; `serverTimingHeader()` there composes both
 * and is what the Nitro plugin actually sends. `desc` is used here — and ONLY
 * here — because a trace id is a random value we minted, not anything derived
 * from the request.
 */
export function serverTimingTrace(span: SpanContext): string {
  return `trace;desc="${span.traceId}"`;
}

/** The `Server-Timing` metric name `lib/rum.ts` looks for. */
export const SERVER_TIMING_TRACE_NAME = 'trace';
