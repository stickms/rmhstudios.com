/**
 * `Server-Timing` phase durations (OPT-49) — `lib/otel/timing.ts`.
 *
 * Two things are actually at risk here and both are covered below.
 *
 * **The header is public.** `Server-Timing` is readable by any same-origin
 * script, and a metric name is header SYNTAX — a name allowed to carry `;`,
 * `,` or `"` turns `mark()` into a header-injection primitive that can smuggle
 * a `desc` onto the wire. So the name rule is tested as a security property,
 * not as input validation.
 *
 * **The scope is shared.** The phase durations ride on the same
 * `AsyncLocalStorage` as the trace id (`lib/otel/trace.ts`), which was widened
 * from `SpanContext` to `TraceScope` to carry them. The trace-side accessors
 * are re-tested for that reason: the correlation id feeding `lib/rum.ts` is
 * load-bearing and the refactor sits directly underneath it.
 */

import { describe, it, expect } from 'vitest';
import {
  PHASES,
  mark,
  markScope,
  measure,
  serverTimingHeader,
  serverTimingPhases,
} from '@/lib/otel/timing';
import {
  currentScope,
  currentSpan,
  currentTraceId,
  newScope,
  startSpan,
  traceFields,
  withTrace,
} from '@/lib/otel/trace';

/** A scope detached from any async context — what the Nitro plugin holds. */
function scope() {
  return newScope(startSpan());
}

/** Everything after the leading `trace;desc="…"` entry. */
function phasesOf(header: string): string[] {
  return header.split(', ').slice(1);
}

describe('markScope', () => {
  it('accumulates rather than replacing — db and cache are sums', () => {
    const s = scope();
    markScope(s, 'db', 1.5);
    markScope(s, 'db', 2.5);
    expect(s.timings.get('db')).toBe(4);
  });

  it('clamps a negative duration to zero instead of dropping it', () => {
    const s = scope();
    markScope(s, 'db', -3);
    expect(s.timings.get('db')).toBe(0);
  });

  it('ignores NaN and Infinity', () => {
    const s = scope();
    markScope(s, 'db', Number.NaN);
    markScope(s, 'cache', Number.POSITIVE_INFINITY);
    expect(s.timings.size).toBe(0);
  });

  it('is a no-op without a scope', () => {
    expect(() => markScope(undefined, 'db', 1)).not.toThrow();
  });

  it('caps the number of distinct phases so a per-key call site cannot grow the header', () => {
    const s = scope();
    for (let i = 0; i < 50; i++) markScope(s, `p${i}`, 1);
    expect(s.timings.size).toBeLessThanOrEqual(12);
    // Already-known phases still accumulate after the cap is reached.
    const before = s.timings.get('p0');
    markScope(s, 'p0', 5);
    expect(s.timings.get('p0')).toBe((before ?? 0) + 5);
  });
});

describe('metric names are header syntax, not free text', () => {
  // Each of these would either break the header's grammar or smuggle content
  // into it. Dropped, never sanitised into something adjacent.
  const rejected = [
    'db;desc="leak"',
    'db,evil;dur=1',
    'db desc',
    'user@id',
    'Sess',
    '',
    '9db',
    'a'.repeat(17),
    'db\r\nX-Injected: 1',
  ];

  it.each(rejected)('drops %j', (name) => {
    const s = scope();
    markScope(s, name, 1);
    expect(s.timings.size).toBe(0);
  });

  it.each([...PHASES])('accepts the shipped phase %s', (name) => {
    const s = scope();
    markScope(s, name, 1);
    expect(s.timings.get(name)).toBe(1);
  });

  it('drops a bad name smuggled straight into the map before it reaches the wire', () => {
    const s = scope();
    // Not reachable through markScope — this is the belt to its braces, because
    // `timings` is a plain Map on an object several modules can see.
    s.timings.set('x;desc="secret"', 1);
    s.timings.set('db', 2);
    expect(serverTimingPhases(s)).toEqual(['db;dur=2.0']);
  });
});

describe('serverTimingHeader', () => {
  it('leads with the trace entry so lib/rum.ts finds it first', () => {
    const s = scope();
    markScope(s, 'db', 12.34);
    expect(serverTimingHeader(s)).toBe(`trace;desc="${s.span.traceId}", db;dur=12.3`);
  });

  it('is just the trace entry when no phase was marked', () => {
    const s = scope();
    expect(serverTimingHeader(s)).toBe(`trace;desc="${s.span.traceId}"`);
  });

  it('orders known phases canonically regardless of when they were marked', () => {
    const s = scope();
    markScope(s, 'total', 4);
    markScope(s, 'db', 3);
    markScope(s, 'sess', 1);
    markScope(s, 'render', 2);
    expect(phasesOf(serverTimingHeader(s))).toEqual([
      'sess;dur=1.0',
      'db;dur=3.0',
      'render;dur=2.0',
      'total;dur=4.0',
    ]);
  });

  it('carries dur only — no desc on a phase entry', () => {
    const s = scope();
    for (const name of PHASES) markScope(s, name, 1);
    expect(phasesOf(serverTimingHeader(s)).join(', ')).not.toContain('desc');
  });

  it('emits a well-formed Server-Timing list', () => {
    const s = scope();
    for (const name of PHASES) markScope(s, name, 1.25);
    for (const entry of serverTimingHeader(s).split(', ')) {
      expect(entry).toMatch(/^[a-z][a-z0-9_-]*;(dur=\d+\.\d|desc="[0-9a-f]{32}")$/);
    }
  });

  it('is empty without a scope', () => {
    expect(serverTimingHeader(undefined)).toBe('');
  });
});

describe('mark / measure against the ambient scope', () => {
  it('does nothing outside a traced scope — workers and scripts call this too', () => {
    expect(() => mark('db', 5)).not.toThrow();
    expect(currentScope()).toBeUndefined();
  });

  it('writes into the scope withTrace opened', () => {
    withTrace(() => {
      mark('cache', 7);
      expect(currentScope()?.timings.get('cache')).toBe(7);
    });
  });

  it('measure records the elapsed time and returns the value', async () => {
    await withTrace(async () => {
      const value = await measure('db', async () => {
        await new Promise((r) => setTimeout(r, 12));
        return 'ok';
      });
      expect(value).toBe('ok');
      const recorded = currentScope()?.timings.get('db') ?? 0;
      expect(recorded).toBeGreaterThan(5);
    });
  });

  it('measure still records when the phase throws — the slow failure is the interesting one', async () => {
    await withTrace(async () => {
      await expect(measure('db', () => Promise.reject(new Error('boom')))).rejects.toThrow('boom');
      expect(currentScope()?.timings.has('db')).toBe(true);
    });
  });

  it('measure outside a scope still runs the function', async () => {
    await expect(measure('db', () => Promise.resolve(3))).resolves.toBe(3);
  });
});

describe('the widened trace scope keeps the correlation id working', () => {
  it('exposes the span, the id and the log fields inside withTrace', () => {
    const span = startSpan();
    withTrace(span, () => {
      expect(currentSpan()).toEqual(span);
      expect(currentTraceId()).toBe(span.traceId);
      expect(traceFields()).toEqual({ traceId: span.traceId, spanId: span.spanId });
    });
  });

  it('reports nothing outside a traced scope', () => {
    expect(currentSpan()).toBeUndefined();
    expect(currentTraceId()).toBeUndefined();
    expect(traceFields()).toEqual({});
  });
});
