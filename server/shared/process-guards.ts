/**
 * Process-level safety net for the long-lived Node services (hubs + workers).
 *
 * Node >= 15 terminates the process on an unhandled promise rejection. For a
 * realtime hub that is catastrophic: all in-memory room/lobby/match state and
 * every connected socket is lost, Docker restarts the container, and every client
 * sees a disconnect storm — all because one fire-and-forget DB/Redis promise
 * somewhere rejected. The web tier already traps these (Nitro's
 * `trapUnhandledErrors`); the hubs did not.
 *
 * Policy: log and keep serving. `uncaughtException` is logged too (state is
 * in-memory and a restart is strictly worse for these services than a handler
 * that threw), but a burst of them is a sign the process is wedged, so after
 * MAX_UNCAUGHT_PER_MINUTE we exit and let the restart policy take over.
 */
import type { Logger } from './logger';

const MAX_UNCAUGHT_PER_MINUTE = 20;

export function installProcessGuards(logger: Logger): void {
  const g = globalThis as { __rmhProcessGuards?: boolean };
  if (g.__rmhProcessGuards) return;
  g.__rmhProcessGuards = true;

  let windowStart = Date.now();
  let count = 0;

  const describe = (e: unknown) =>
    e instanceof Error ? { message: e.message, stack: e.stack } : { message: String(e) };

  process.on('unhandledRejection', (reason) => {
    logger.error({ event: 'unhandled_rejection', ...describe(reason) });
  });

  process.on('uncaughtException', (err) => {
    logger.error({ event: 'uncaught_exception', ...describe(err) });
    const now = Date.now();
    if (now - windowStart > 60_000) {
      windowStart = now;
      count = 0;
    }
    if (++count > MAX_UNCAUGHT_PER_MINUTE) {
      logger.error({ event: 'uncaught_exception_storm', count });
      process.exit(1);
    }
  });
}
