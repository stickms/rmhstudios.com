/**
 * One place to turn input sources on and off and listen to all of them. The
 * hub subscribes to an adapter only while it is started, remembers why a start
 * failed (so the UI can say "microphone blocked" and still offer the keyboard),
 * and never lets one source's failure touch another. Pure orchestration over
 * `InputAdapter`s, client-safe and unit-tested with fakes.
 */
import type { InputAdapter, InputSource, NoteEvent, NoteListener } from './events';

export interface InputHub {
  /** Listen to every started adapter; returns a function that removes it. */
  subscribe(l: NoteListener): () => void;
  /** Start a source. Failure is recorded in `lastError` and rethrown. */
  start(source: InputSource): Promise<void>;
  /** Stop a source; a no-op if it was never started. */
  stop(source: InputSource): void;
  /** Sources currently started, in the order they were started. */
  active(): InputSource[];
  lastError(source: InputSource): Error | null;
}

export function createInputHub(adapters: InputAdapter[]): InputHub {
  const bySource = new Map<InputSource, InputAdapter>(adapters.map((a) => [a.source, a]));
  const listeners = new Set<NoteListener>();
  /** Started sources, each with the function that unsubscribes the hub from it. */
  const started = new Map<InputSource, () => void>();
  const starting = new Map<InputSource, Promise<void>>();
  /** Sources whose in-flight start was stopped before it settled. */
  const cancelled = new Set<InputSource>();
  /**
   * Bumped by every stop(). A start remembers the value from when it was
   * requested and abandons itself if it has moved on by the time it would run,
   * so the user's last action (stop) always wins over a start queued behind a
   * cancelled one.
   */
  const stops = new Map<InputSource, number>();
  const stopCount = (source: InputSource) => stops.get(source) ?? 0;
  const errors = new Map<InputSource, Error>();

  const forward = (e: NoteEvent) => {
    for (const l of [...listeners]) l(e);
  };

  const startAdapter = async (source: InputSource, adapter: InputAdapter) => {
    // Subscribe first so a note emitted while start() resolves is not lost.
    const unsubscribe = adapter.subscribe(forward);
    try {
      await adapter.start();
    } catch (err) {
      unsubscribe();
      // A start that was stopped meanwhile is not an error to report.
      if (cancelled.delete(source)) return;
      errors.set(source, err instanceof Error ? err : new Error(String(err)));
      throw err;
    }
    if (cancelled.delete(source)) {
      // stop() came while the start was pending (e.g. a permission prompt):
      // the adapter has now acquired its device, so release it.
      adapter.stop();
      unsubscribe();
      return;
    }
    errors.delete(source);
    started.set(source, unsubscribe);
  };

  const hub: InputHub = {
    subscribe(l) {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },

    start(source) {
      const adapter = bySource.get(source);
      if (!adapter) return Promise.reject(new Error(`No input adapter for "${source}"`));
      const requested = stopCount(source);
      const launch = (): Promise<void> => {
        if (stopCount(source) !== requested) return Promise.resolve();
        if (started.has(source)) return Promise.resolve();
        const pending = starting.get(source);
        if (pending) {
          if (!cancelled.has(source)) return pending;
          // Stopped while starting: wait for that start to unwind, then start afresh.
          return pending.then(launch, launch);
        }
        const run = startAdapter(source, adapter).finally(() => starting.delete(source));
        starting.set(source, run);
        return run;
      };
      return launch();
    },

    stop(source) {
      stops.set(source, stopCount(source) + 1);
      if (starting.has(source)) {
        cancelled.add(source);
        // Tell the adapter now, so it releases the device the instant it is
        // handed over rather than only when the hub hears the start settle.
        bySource.get(source)?.stop();
      }
      const unsubscribe = started.get(source);
      if (!unsubscribe) return;
      // Stop before unsubscribing: stopping releases held notes, and those
      // `off` events must still reach the listeners.
      bySource.get(source)?.stop();
      unsubscribe();
      started.delete(source);
    },

    active() {
      return [...started.keys()];
    },

    lastError(source) {
      return errors.get(source) ?? null;
    },
  };
  return hub;
}
