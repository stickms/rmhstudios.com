import { SPRINGS, springSettled, springStep, type Spring, type SpringState } from '@/lib/fluid';

/**
 * The settle spring behind `useFluidDrag`, as a plain object so it can be tested without React. It requests a frame
 * only between a release and the spring arriving, and none otherwise (R5). Each settle owns its own loop, so two drag
 * surfaces never cancel each other.
 */
export interface Settle {
  /** Spring from `from` (carrying `velocity`) to `to`; replaces any settle in flight. */
  start(
    from: number,
    velocity: number,
    to: number,
    onStep: (x: number, velocity: number) => void,
    onDone: () => void,
    spring?: Spring,
  ): void;
  /** Stop settling where it is (the caller takes over). */
  cancel(): void;
  /** Cancel and unregister the driver. A later `start` registers a fresh one. */
  dispose(): void;
}

export interface SettleOptions {
  /** Frame scheduling; defaults to the window's. */
  raf?: (cb: FrameRequestCallback) => number;
  caf?: (id: number) => void;
}

export function createSettle(options: SettleOptions = {}): Settle {
  const raf = options.raf ?? ((cb) => window.requestAnimationFrame(cb));
  const caf = options.caf ?? ((id) => window.cancelAnimationFrame(id));

  let handle: number | null = null;
  let last = 0;
  let active = false;
  let state: SpringState = { value: 0, velocity: 0 };
  let target = 0;
  let spring: Spring = SPRINGS.sheet;
  let onStep: (x: number, velocity: number) => void = () => {};
  let onDone: () => void = () => {};

  const halt = () => {
    active = false;
    if (handle !== null) caf(handle);
    handle = null;
  };

  const frame = (now: number) => {
    handle = null;
    if (!active) return;
    const dtMs = last === 0 ? 16 : now - last;
    last = now;
    // A 64ms cap: a long frame (tab switch) must not integrate the spring past stability.
    state = springStep(state, target, spring, Math.min(0.064, Math.max(0, dtMs) / 1000));
    onStep(state.value, state.velocity);
    if (springSettled(state, target, 0.2, 2)) {
      active = false;
      state = { value: target, velocity: 0 };
      onStep(target, 0);
      onDone();
      return;
    }
    handle = raf(frame);
  };

  return {
    start(from, velocity, to, step, done, s) {
      state = { value: from, velocity };
      target = to;
      spring = s ?? SPRINGS.sheet;
      onStep = step;
      onDone = done;
      active = true;
      if (handle === null) {
        last = 0;
        handle = raf(frame);
      }
    },
    cancel: halt,
    dispose: halt,
  };
}
