import { SPRINGS, springSettled, springStep, type Spring, type SpringState } from '@/lib/fluid';
import { drive as sharedDrive, type FrameDriver, type FrameDriverFn } from '@/lib/jelly/frame';

/**
 * The settle spring behind `useFluidDrag`, as a plain object so it can be tested without React. It runs on the shared
 * jelly frame driver (`lib/jelly/frame.ts`) rather than a private `requestAnimationFrame`: awake only between a
 * release and the spring arriving, asleep (no frame requested) otherwise. Each settle owns its own driver, so two drag
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

/**
 * Frame order of the settle driver: before physics (10), engine (20), runtime (25) and arcs (30), so a drag owner's
 * position for a frame is written before the soft body reads it (the order table in `lib/jelly/frame.ts`).
 */
export const FLUID_DRAG_FRAME_ORDER = 5;

export interface SettleOptions {
  /** Frame order; defaults to `FLUID_DRAG_FRAME_ORDER` (before physics). */
  order?: number;
  drive?: (fn: FrameDriverFn, opts?: { order?: number }) => FrameDriver;
}

export function createSettle(options: SettleOptions = {}): Settle {
  const order = options.order ?? FLUID_DRAG_FRAME_ORDER;
  const drive = options.drive ?? ((fn, opts) => sharedDrive(fn, opts));

  let driver: FrameDriver | null = null;
  let active = false;
  let state: SpringState = { value: 0, velocity: 0 };
  let target = 0;
  let spring: Spring = SPRINGS.sheet;
  let onStep: (x: number, velocity: number) => void = () => {};
  let onDone: () => void = () => {};

  const frame: FrameDriverFn = (_now, dtMs) => {
    if (!active) return false;
    // A 64ms cap: a long frame (tab switch) must not integrate the spring past stability.
    state = springStep(state, target, spring, Math.min(0.064, Math.max(0, dtMs) / 1000));
    onStep(state.value, state.velocity);
    if (springSettled(state, target, 0.2, 2)) {
      active = false;
      state = { value: target, velocity: 0 };
      onStep(target, 0);
      onDone();
      return false;
    }
    return true;
  };

  return {
    start(from, velocity, to, step, done, s) {
      state = { value: from, velocity };
      target = to;
      spring = s ?? SPRINGS.sheet;
      onStep = step;
      onDone = done;
      active = true;
      driver ??= drive(frame, { order });
      driver.wake();
    },
    cancel() {
      active = false;
    },
    dispose() {
      active = false;
      driver?.stop();
      driver = null;
    },
  };
}
