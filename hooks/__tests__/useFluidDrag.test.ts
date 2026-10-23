/**
 * `useFluidDrag` rides the jelly's shared services (CLAUDE.md "Design system: Plasmatic Jelly" → Performance): its
 * settle spring is a driver on the ONE frame (`lib/jelly/frame.ts`) and its move/up/cancel come from the ONE pointer
 * hub (`lib/jelly/pointer.ts`). What it must prove:
 *  - mounting adds the hub's listeners, not the hook's own, and requests no frame;
 *  - a drag tracks the pointer 1:1, and release settles back to 0 through shared frames, then sleeps (no frame
 *    pending at rest) and calls `onSettle` once;
 *  - a throw past the threshold dismisses and the spring continues the throw;
 *  - a new press interrupts a settle; unmount unregisters the driver and the hub's listeners.
 *
 * The suite runs in `node`, so React is replaced by a minimal single-render hook runtime (refs, callbacks, effects
 * run on mount, cleanups on unmount) — enough to drive the hook's real logic against the real services.
 */
// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const effects: Array<() => void | (() => void)> = [];
vi.mock('react', () => ({
  useRef: <T>(v: T) => ({ current: v }),
  useCallback: <T>(fn: T) => fn,
  useState: <T>(v: T) => [v, () => {}],
  useEffect: (fn: () => void | (() => void)) => {
    effects.push(fn);
  },
}));

const { useFluidDrag, FLUID_DRAG_FRAME_ORDER } = await import('../useFluidDrag');
/** The hook as a plain function: the mocked React above is the "render" (one call, then the effects). */
const renderDrag = useFluidDrag;

type Listener = (e: Event) => void;

function fakeWindow() {
  const listeners = new Map<string, Set<Listener>>();
  const frames = new Map<number, FrameRequestCallback>();
  let id = 0;
  let now = 1000;
  const win = {
    addEventListener: vi.fn((type: string, fn: Listener, _opts?: AddEventListenerOptions) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(fn);
    }),
    removeEventListener: vi.fn((type: string, fn: Listener) => {
      listeners.get(type)?.delete(fn);
    }),
    requestAnimationFrame: vi.fn((cb: FrameRequestCallback) => {
      frames.set(++id, cb);
      return id;
    }),
    cancelAnimationFrame: vi.fn((h: number) => {
      frames.delete(h);
    }),
  };
  const fire = (type: string, extra: Record<string, unknown>) => {
    const e = { type, ...extra } as unknown as Event;
    for (const fn of [...(listeners.get(type) ?? [])]) fn(e);
  };
  /** Run pending frames at `hz` until none is pending (or `max`); returns how many ran. */
  const flush = (hz = 60, max = 2000) => {
    let n = 0;
    while (frames.size && n < max) {
      const [h, cb] = frames.entries().next().value as [number, FrameRequestCallback];
      frames.delete(h);
      now += 1000 / hz;
      cb(now);
      n++;
    }
    return n;
  };
  const listenerCount = () => [...listeners.values()].reduce((n, s) => n + s.size, 0);
  return { win, fire, flush, frames, listenerCount, time: () => now };
}

function mount(opts: Parameters<typeof useFluidDrag>[0]) {
  effects.length = 0;
  const handle = renderDrag(opts);
  const cleanups = effects
    .map((fn) => fn())
    .filter((c): c is () => void => typeof c === 'function');
  return { handle, unmount: () => cleanups.forEach((c) => c()) };
}

let w: ReturnType<typeof fakeWindow>;

beforeEach(() => {
  w = fakeWindow();
  vi.stubGlobal('window', w.win);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const down = (handle: ReturnType<typeof useFluidDrag>, y: number, t: number) =>
  handle.handleProps.onPointerDown({
    pointerId: 1,
    button: 0,
    clientX: 0,
    clientY: y,
    timeStamp: t,
  } as unknown as React.PointerEvent);

describe('useFluidDrag on the shared jelly frame and pointer hub', () => {
  it('runs before physics (10)', () => {
    expect(FLUID_DRAG_FRAME_ORDER).toBeLessThan(10);
  });

  it('subscribes through the hub (capture + passive) and requests no frame at rest', () => {
    const { unmount } = mount({ dimension: () => 400, onUpdate: () => {} });
    const types = w.win.addEventListener.mock.calls.map((c) => c[0]);
    expect(types).toEqual(expect.arrayContaining(['pointermove', 'pointerup', 'pointercancel']));
    for (const c of w.win.addEventListener.mock.calls) {
      expect(c[2]).toMatchObject({ capture: true, passive: true });
    }
    expect(w.win.requestAnimationFrame).not.toHaveBeenCalled();
    unmount();
    expect(w.listenerCount()).toBe(0);
  });

  it('tracks the pointer 1:1, then settles back to rest on shared frames and sleeps', () => {
    const updates: number[] = [];
    const onSettle = vi.fn();
    const { handle, unmount } = mount({
      dimension: () => 400,
      onUpdate: (v) => updates.push(v),
      onSettle,
      onDismiss: vi.fn(),
      min: 0,
    });
    down(handle, 100, 0);
    w.fire('pointermove', { pointerId: 1, clientX: 0, clientY: 140, timeStamp: 200 });
    expect(updates.at(-1)).toBe(40);
    expect(w.win.requestAnimationFrame).not.toHaveBeenCalled();
    w.fire('pointerup', { pointerId: 1, clientX: 0, clientY: 140, timeStamp: 1200 });
    const ran = w.flush(60);
    expect(ran).toBeGreaterThan(3);
    expect(ran).toBeLessThan(2000);
    expect(updates.at(-1)).toBe(0);
    expect(onSettle).toHaveBeenCalledTimes(1);
    expect(w.frames.size, 'no frame pending at rest').toBe(0);
    unmount();
  });

  it('settles in about the same wall time at 30 Hz and 144 Hz (dt-based spring)', () => {
    const settleMs = (hz: number) => {
      w = fakeWindow();
      vi.stubGlobal('window', w.win);
      const { handle, unmount } = mount({ dimension: () => 400, onUpdate: () => {} });
      down(handle, 0, 0);
      w.fire('pointermove', { pointerId: 1, clientX: 0, clientY: 80, timeStamp: 400 });
      w.fire('pointerup', { pointerId: 1, clientX: 0, clientY: 80, timeStamp: 2000 });
      const t0 = w.time();
      w.flush(hz);
      unmount();
      return w.time() - t0;
    };
    const slow = settleMs(30);
    const fast = settleMs(144);
    expect(Math.abs(slow - fast)).toBeLessThan(Math.max(slow, fast) * 0.25);
  });

  it('dismisses a throw past the threshold and continues it', () => {
    const updates: number[] = [];
    const onDismiss = vi.fn();
    const onSettle = vi.fn();
    const { handle, unmount } = mount({
      dimension: () => 400,
      onUpdate: (v) => updates.push(v),
      onDismiss,
      onSettle,
    });
    down(handle, 0, 0);
    w.fire('pointermove', { pointerId: 1, clientX: 0, clientY: 150, timeStamp: 50 });
    w.fire('pointermove', { pointerId: 1, clientX: 0, clientY: 300, timeStamp: 100 });
    w.fire('pointerup', { pointerId: 1, clientX: 0, clientY: 300, timeStamp: 110 });
    expect(onDismiss).toHaveBeenCalledTimes(1);
    w.flush(60);
    expect(updates.at(-1)).toBeCloseTo(460);
    expect(onSettle).not.toHaveBeenCalled();
    unmount();
  });

  it('a new press interrupts a settle; unmount unregisters the driver', () => {
    const updates: number[] = [];
    const { handle, unmount } = mount({ dimension: () => 400, onUpdate: (v) => updates.push(v) });
    down(handle, 0, 0);
    w.fire('pointermove', { pointerId: 1, clientX: 0, clientY: 100, timeStamp: 500 });
    w.fire('pointerup', { pointerId: 1, clientX: 0, clientY: 100, timeStamp: 2000 });
    w.flush(60, 3);
    const mid = updates.at(-1)!;
    expect(mid).toBeGreaterThan(0);
    down(handle, 0, 3000);
    const before = updates.length;
    w.flush(60);
    expect(updates.length, 'the interrupted spring no longer steps').toBe(before);
    w.fire('pointerup', { pointerId: 1, clientX: 0, clientY: 0, timeStamp: 4000 });
    expect(w.frames.size).toBe(1);
    unmount();
    expect(w.frames.size, 'unmount cancels the pending frame').toBe(0);
    expect(w.listenerCount()).toBe(0);
  });
});
