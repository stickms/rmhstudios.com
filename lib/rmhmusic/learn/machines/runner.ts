/**
 * A tiny synchronous holder for a pure machine, for screens: `send` applies
 * the transition at once and returns the effects for the caller to carry out
 * (with its current props), and `subscribe`/`get` plug into
 * `useSyncExternalStore`. Synchronous on purpose: two events in one tick (a
 * MIDI chord) must see each other's transition, which React state set from
 * an event handler does not. Client-safe; no React here.
 */
export interface Machine<S, E, F> {
  initial: S;
  step(state: S, event: E): { state: S; effects: F[] };
}

export interface Runner<S, E, F> {
  get(): S;
  send(event: E): F[];
  subscribe(listener: () => void): () => void;
}

export function createRunner<S, E, F>(machine: Machine<S, E, F>): Runner<S, E, F> {
  let state = machine.initial;
  const listeners = new Set<() => void>();
  return {
    get: () => state,
    send(event) {
      const next = machine.step(state, event);
      if (next.state !== state) {
        state = next.state;
        for (const l of [...listeners]) l();
      }
      return next.effects;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
