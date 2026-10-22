// Process-level failure guards for the standalone Node services (hubs + workers).
//
// WHY: none of the hubs or workers installed `unhandledRejection` /
// `uncaughtException` handlers, so on Node 24 one forgotten `await` in a game
// handler killed the whole socket hub — every table and lobby on it — with an
// unstructured stack on stderr and nothing an alarm could count. The web tier
// is already covered: Nitro traps both events and routes them to the `error`
// hook (`server/nitro/otel.ts` counts them there).
//
// POLICY:
//   - unhandledRejection → log + count, KEEP RUNNING. A rejected promise is
//     almost always one request/event's failure; killing the process turns it
//     into an outage for every connected user. This matches the web tier.
//   - uncaughtException  → log + count, then EXIT 1. A synchronous throw that
//     reached the top leaves the process in an unknown state (Node's own
//     guidance); Docker's restart policy brings it back clean.
//
// The counters (`process.unhandled_rejection`, `process.uncaught_exception`,
// `db.pool_error`) land in the in-process collector, so they surface in
// `/internal/metrics` and the Redis perf snapshots that the on-call alarms read.
// The log lines use the same JSON shape as `server/shared/logger.ts` so a log
// search for `"event":"uncaught_exception"` finds every service.
//
// Pure Node, no `@/` imports: the hubs' esbuild bundles import it by relative
// path (server/CLAUDE.md gotcha 7).

import { recordCounter } from './process-metrics';

const INSTALLED = Symbol.for('rmh.perf.processGuards');

function describe(err: unknown): { error: string; stack?: string } {
  if (err instanceof Error) return { error: err.message, stack: err.stack };
  try {
    return { error: typeof err === 'string' ? err : JSON.stringify(err) };
  } catch {
    return { error: String(err) };
  }
}

function logError(service: string, event: string, fields: Record<string, unknown>): void {
  try {
    console.error(
      JSON.stringify({ level: 'error', service, timestamp: new Date().toISOString(), event, ...fields }),
    );
  } catch {
    // Logging must not become the error.
  }
}

export interface ProcessGuardOptions {
  service: string;
  /** Test seam: replaces `process.exit` on an uncaught exception. */
  exit?: (code: number) => void;
}

/** Idempotent. Call once at the top of a service's entrypoint. */
export function installProcessGuards(opts: ProcessGuardOptions): void {
  const g = globalThis as unknown as Record<symbol, boolean | undefined>;
  if (g[INSTALLED]) return;
  g[INSTALLED] = true;

  const exit = opts.exit ?? ((code: number) => process.exit(code));

  process.on('unhandledRejection', (reason) => {
    recordCounter('process.unhandled_rejection');
    logError(opts.service, 'unhandled_rejection', describe(reason));
  });

  process.on('uncaughtException', (err, origin) => {
    recordCounter('process.uncaught_exception');
    logError(opts.service, 'uncaught_exception', { origin, ...describe(err) });
    // stderr is a pipe under Docker, which Node writes synchronously on Linux,
    // so the line above is flushed before the exit.
    exit(1);
  });
}

/** The slice of `pg.Pool` this needs — structural, so lib/perf stays free of a `pg` import. */
interface ErrorEmitter {
  on(event: 'error', listener: (err: Error) => void): unknown;
}

/**
 * Attach an `'error'` listener to a raw `pg.Pool`.
 *
 * An idle client that loses its connection (Postgres restart, failover, a killed
 * backend) makes the pool emit `'error'`; with no listener that is an uncaught
 * exception and the process dies. The pool discards the broken client and
 * reconnects on the next checkout, so logging + counting is the whole fix.
 *
 * Also safe on a pool handed to `PrismaPg`: the adapter attaches its own
 * listener (so it never crashed) but swallows the error silently — this adds the
 * count, which is what makes a flapping database visible.
 */
export function guardPool<T extends ErrorEmitter>(pool: T, opts: { service?: string; pool: string }): T {
  pool.on('error', (err) => {
    recordCounter('db.pool_error');
    logError(opts.service ?? 'node', 'db_pool_error', { pool: opts.pool, ...describe(err) });
  });
  return pool;
}
