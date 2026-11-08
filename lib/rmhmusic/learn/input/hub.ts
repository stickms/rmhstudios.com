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
      errors.set(source, err instanceof Error ? err : new Error(String(err)));
      throw err;
    }
    errors.delete(source);
    started.set(source, unsubscribe);
  };

  return {
    subscribe(l) {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },

    start(source) {
      const adapter = bySource.get(source);
      if (!adapter) return Promise.reject(new Error(`No input adapter for "${source}"`));
      if (started.has(source)) return Promise.resolve();
      const pending = starting.get(source);
      if (pending) return pending;
      const run = startAdapter(source, adapter).finally(() => starting.delete(source));
      starting.set(source, run);
      return run;
    },

    stop(source) {
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
}
