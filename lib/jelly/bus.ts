/**
 * The jelly event bus: one tiny synchronous typed emitter shared by the engine, carriers, physics and arcs (master
 * plan §4.2, R4; 03 §6.3).
 *
 * It exists so the services can react to each other without importing each other: arcs announce a strike and never
 * need physics to exist; physics announces a release and never needs arcs. Synchronous on purpose — a strike's
 * impulse lands in the same frame as the bolt — and with no React, so it runs from document services.
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
  /** physics → arcs (charge) + material pulse. */
  'body:release': { el: Element; x: number; y: number; energy: number };
  'drag:start': { el: Element };
  'drag:end': { el: Element };
  /** engine → carriers (`data-jelly-haze`). */
  'haze:change': { el: Element; on: boolean };
  /**
   * arcs → engine: charge `q` (0..1) deposited at viewport point (x, y) on `el` — rendered as a ring travelling
   * through the gel at `CHARGE.pulseSpeedPxS`, decaying with `CHARGE.pulseTauMs` (#989).
   */
  'charge:pulse': { el: Element; x: number; y: number; q: number };
  /**
   * arcs → physics: Coulomb attraction on `el` toward a charged neighbour, unit direction (nx, ny) and force in
   * [0, 1]; physics turns it into a bounded translate (≤ MOTION_BOUNDS.nudgePx), equal and opposite on the pair.
   */
  'charge:attract': { el: Element; nx: number; ny: number; force: number };
  /** physics → engine + arcs: plasma wake level of `el` (0 rest, `PLASMA.wake` hover, 1 press/focus/click). */
  'plasma:level': { el: Element; level: number };
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
