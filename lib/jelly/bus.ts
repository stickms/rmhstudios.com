/**
 * The jelly event bus: one tiny synchronous typed emitter shared by the arcs and the drag owners (master plan §4.2, R4;
 * 03 §6.3).
 *
 * It exists so the services can react to each other without importing each other: arcs announce a strike and never
 * need a listener to exist; a drag owner announces a drag and never needs arcs. Synchronous on purpose — a strike's
 * impulse lands in the same frame as the bolt — and with no React, so it runs from document services. (The engine,
 * carriers and soft-body physics that used to share it are gone; their events went with them.)
 *
 * A throwing listener is reported asynchronously (it still reaches the console and `client-errors`) and never stops
 * the listeners after it: one broken consumer must not silence the others.
 */

export type JellyEvents = {
  'arc:strike': {
    el: Element;
    x: number;
    y: number;
    nx: number;
    ny: number;
    energy: number;
    kind: 'ambient' | 'click' | 'key';
  };
  'drag:start': { el: Element };
  'drag:end': { el: Element };
  /** arcs → anyone: charge `q` (0..1) deposited at viewport point (x, y) on `el` (#989). Nothing in the site listens. */
  'charge:pulse': { el: Element; x: number; y: number; q: number };
  /**
   * arcs → anyone: Coulomb attraction on `el` toward a charged neighbour, unit direction (nx, ny) and force in
   * [0, 1]. Only the ambient runtime emits it; nothing in the site listens.
   */
  'charge:attract': { el: Element; nx: number; ny: number; force: number };
};

export type JellyEventName = keyof JellyEvents;
export type JellyListener<K extends JellyEventName> = (payload: JellyEvents[K]) => void;

export interface JellyBus {
  /** Subscribe; returns the unsubscribe. Subscribing the same function twice is one subscription. */
  on<K extends JellyEventName>(type: K, fn: JellyListener<K>): () => void;
  /** Call every current listener of `type`, in subscription order, synchronously. */
  emit<K extends JellyEventName>(type: K, payload: JellyEvents[K]): void;
  /** Number of listeners for `type` — lets an emitter skip building a payload nobody reads. */
  listenerCount(type: JellyEventName): number;
}

const report = (error: unknown) => {
  queueMicrotask(() => {
    throw error;
  });
};

/** A fresh bus. The site uses {@link jellyBus}; this exists for tests and isolated documents. */
export function createJellyBus(): JellyBus {
  const listeners = new Map<JellyEventName, Set<(payload: never) => void>>();
  return {
    on(type, fn) {
      let set = listeners.get(type);
      if (!set) listeners.set(type, (set = new Set()));
      set.add(fn as (payload: never) => void);
      return () => {
        set.delete(fn as (payload: never) => void);
      };
    },
    emit(type, payload) {
      const set = listeners.get(type);
      if (!set || set.size === 0) return;
      // Snapshot: a listener that unsubscribes (or subscribes) mid-emit changes the NEXT emit, not this one.
      for (const fn of [...set]) {
        try {
          (fn as (p: typeof payload) => void)(payload);
        } catch (error) {
          report(error);
        }
      }
    },
    listenerCount(type) {
      return listeners.get(type)?.size ?? 0;
    },
  };
}

/** The site-wide bus. */
export const jellyBus: JellyBus = createJellyBus();
