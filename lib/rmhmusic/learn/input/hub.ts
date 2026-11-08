/**
 * One place to turn input sources on and off and listen to all of them. The
 * hub subscribes to an adapter only while it is started, remembers why a start
 * failed (so the UI can say "microphone blocked" and still offer the keyboard),
 * and never lets one source's failure touch another. Client-safe and
 * unit-tested with fakes.
 *
 * Each source's start/stop/cancel lifecycle is the pure machine in
 * `../machines/device-lifecycle.ts`; this file only interprets its effects
 * (subscribe and start the adapter, stop it, unsubscribe, settle the callers'
 * promises) and feeds the adapter's answers back as events.
 */
import * as life from '../machines/device-lifecycle';
import type { InputAdapter, InputSource, NoteEvent, NoteListener } from './events';

export type InputPhase = life.Phase;

/** Every source's phase, replaced (never mutated) whenever one changes. */
export type InputPhases = Readonly<Record<InputSource, InputPhase>>;

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
  /** Where a source is in its lifecycle (a start waiting on a permission prompt is `starting`). */
  phase(source: InputSource): InputPhase;
  /** The phases of every source; the same object until one changes (for `useSyncExternalStore`). */
  phases(): InputPhases;
  /** Hear every phase change; returns a function that removes the listener. */
  onChange(l: () => void): () => void;
}

const SOURCES: readonly InputSource[] = ['mic', 'midi', 'keys', 'screen'];

interface Waiter {
  resolve(): void;
  reject(err: Error): void;
}

interface Slot {
  adapter: InputAdapter;
  state: life.State;
  unsubscribe: (() => void) | null;
  /** `start()` callers, by the run that answers them. */
  waiters: Map<number, Waiter[]>;
}

export function createInputHub(adapters: InputAdapter[]): InputHub {
  const slots = new Map<InputSource, Slot>(
    adapters.map((a) => [
      a.source,
      { adapter: a, state: life.initial, unsubscribe: null, waiters: new Map() },
    ]),
  );
  const listeners = new Set<NoteListener>();
  const changeListeners = new Set<() => void>();
  /** Started sources in the order they became active. */
  let order: InputSource[] = [];
  let snapshot: InputPhases = phasesNow();

  function phasesNow(): InputPhases {
    const out = {} as Record<InputSource, InputPhase>;
    for (const s of SOURCES) out[s] = slots.get(s) ? life.phase(slots.get(s)!.state) : 'idle';
    return out;
  }

  const forward = (e: NoteEvent) => {
    for (const l of [...listeners]) l(e);
  };

  const join = (slot: Slot, run: number, w: Waiter) => {
    const list = slot.waiters.get(run);
    if (list) list.push(w);
    else slot.waiters.set(run, [w]);
  };

  const answer = (slot: Slot, run: number, error: Error | null) => {
    const list = slot.waiters.get(run);
    slot.waiters.delete(run);
    for (const w of list ?? []) {
      if (error) w.reject(error);
      else w.resolve();
    }
  };

  const launch = (source: InputSource, slot: Slot, run: number) => {
    // Subscribe first so a note emitted while start() resolves is not lost.
    slot.unsubscribe?.();
    slot.unsubscribe = slot.adapter.subscribe(forward);
    let started: Promise<void>;
    try {
      started = slot.adapter.start();
    } catch (err) {
      started = Promise.reject(err);
    }
    started.then(
      () => send(source, { type: 'started', run }),
      (err: unknown) =>
        send(source, {
          type: 'failed',
          run,
          error: err instanceof Error ? err : new Error(String(err)),
        }),
    );
  };

  /** Feed one event to a source's machine and carry out what it says. */
  function send(source: InputSource, event: life.Event, waiter?: Waiter): void {
    const slot = slots.get(source);
    if (!slot) return;
    const before = life.phase(slot.state);
    const { state, effects } = life.step(slot.state, event);
    slot.state = state;
    const after = life.phase(state);
    if (after === 'active' && !order.includes(source)) order = [...order, source];
    if (after !== 'active' && order.includes(source)) order = order.filter((s) => s !== source);
    for (const fx of effects) {
      switch (fx.type) {
        case 'launch':
          launch(source, slot, fx.run);
          break;
        case 'join':
          if (waiter) join(slot, fx.run, waiter);
          break;
        case 'answer-now':
          waiter?.resolve();
          break;
        case 'stop-device':
          slot.adapter.stop();
          break;
        case 'unsubscribe':
          slot.unsubscribe?.();
          slot.unsubscribe = null;
          break;
        case 'answer':
          answer(slot, fx.run, fx.error);
          break;
        default: {
          const never: never = fx;
          throw new Error(`hub: unhandled effect ${JSON.stringify(never)}`);
        }
      }
    }
    if (after !== before) {
      snapshot = phasesNow();
      for (const l of [...changeListeners]) l();
    }
  }

  return {
    subscribe(l) {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },

    start(source) {
      if (!slots.has(source)) return Promise.reject(new Error(`No input adapter for "${source}"`));
      return new Promise<void>((resolve, reject) =>
        send(source, { type: 'start' }, { resolve, reject }),
      );
    },

    stop(source) {
      send(source, { type: 'stop' });
    },

    active() {
      return [...order];
    },

    lastError(source) {
      const slot = slots.get(source);
      return slot ? life.lastError(slot.state) : null;
    },

    phase(source) {
      return snapshot[source];
    },

    phases() {
      return snapshot;
    },

    onChange(l) {
      changeListeners.add(l);
      return () => {
        changeListeners.delete(l);
      };
    },
  };
}
