/**
 * The overlap guard for the medschools-worker ticks, kept out of `index.ts` (which starts the worker on import) so it
 * can be tested. A job's queue is `exclusive`, so a second tick only happens when pg-boss has already expired the first
 * run, and then the in-process `running` flag used to stay set for ever if the run had hung (a request that never
 * settles): every later tick was skipped and nothing logged why. Now a run in flight longer than `maxRuntimeMs` (the
 * queue's expiry) is logged loudly, abandoned, and the next tick is allowed to start.
 */
export interface GuardDeps {
  log: { info(line: string): void; error(line: string): void };
  isStopping(): boolean;
  /** Shutdown waits on these (bounded). An abandoned run is removed so it cannot hold the shutdown. */
  inFlight: Set<Promise<void>>;
  /** Milliseconds clock (injected by tests). */
  now?: () => number;
}

export function createGuard(deps: GuardDeps) {
  const now = deps.now ?? (() => Date.now());
  return function guarded(
    name: string,
    run: (data: Record<string, unknown>) => Promise<void>,
    maxRuntimeMs?: number,
  ): (data?: Record<string, unknown>) => Promise<void> {
    let running: { startedAt: number; p: Promise<void> } | null = null;
    return async (data = {}) => {
      if (deps.isStopping()) return;
      if (running) {
        const age = now() - running.startedAt;
        if (maxRuntimeMs !== undefined && age > maxRuntimeMs) {
          deps.log.error(
            `${name} run has been in flight for ${Math.round(age / 60_000)} min, over its max runtime of ${Math.round(maxRuntimeMs / 60_000)} min: treating it as hung, abandoning it and starting a new run`,
          );
          deps.inFlight.delete(running.p);
          running = null;
        } else {
          deps.log.info(`${name} tick skipped — previous run still in flight (${Math.round(age / 1000)} s)`);
          return;
        }
      }
      const p = (async () => {
        try {
          await run(data);
        } catch (e) {
          deps.log.error(`${name} run failed: ${e instanceof Error ? e.message : String(e)}`);
        }
      })();
      const mine = { startedAt: now(), p };
      running = mine;
      deps.inFlight.add(p);
      try {
        await p;
      } finally {
        deps.inFlight.delete(p);
        // Only the run that is still current clears the flag: an abandoned one finishing late must not release a newer run.
        if (running === mine) running = null;
      }
    };
  };
}
