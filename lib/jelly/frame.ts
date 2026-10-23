/**
 * The jelly frame driver: the ONE `requestAnimationFrame` behind every jelly service (CLAUDE.md "Design system:
 * Plasmatic Jelly" → Performance; #989 `engine.drive(fn)`).
 *
 * The engine's ambient clock and rim draws, the soft body and the arc renderer each register a driver instead of
 * owning a loop. A driver runs on a frame only while it is awake: it wakes itself (`wake()`) when something starts to
 * move and stays awake by returning `true`; returning anything else lets it sleep. When no driver is awake no frame is
 * requested at all — the page at rest costs nothing beyond what an awake driver asks for (the ambient clock asks at its
 * own rate by waking from a timer, never by spinning).
 *
 * Drivers run in ascending `order` (ties keep registration order), so a producer runs before its consumer in the same
 * frame: a drag owner (`useFluidDrag`, 5) moves its sheet, physics (10) writes the dent and lattice drives that the engine (20) draws, and arcs (30) draw last. Rect
 * reads belong in scroll/resize/activation handlers, never in a driver.
 *
 * One driver throwing is reported asynchronously and never stops the others or the loop.
 */

export type FrameDriverFn = (now: number, dt: number) => boolean | void;

export interface FrameDriver {
  /** Ask for the next frame (idempotent). */
  wake(): void;
  /** Whether the driver will run on the next frame. */
  readonly awake: boolean;
  /** Unregister; a pending frame with no other awake driver is cancelled. */
  stop(): void;
}

export interface FrameDriverOptions {
  /** Lower runs first. Physics 10, engine 20, arcs 30. Default 50. */
  order?: number;
}

interface Entry {
  fn: FrameDriverFn;
  order: number;
  seq: number;
  awake: boolean;
  last: number;
}

/** The loop for one window. Exported for tests (`createFrameLoop(fakeWindow)`). */
export function createFrameLoop(
  win: Pick<Window, 'requestAnimationFrame' | 'cancelAnimationFrame'>,
) {
  const entries: Entry[] = [];
  let seq = 0;
  let handle: number | null = null;

  const schedule = () => {
    if (handle === null && entries.some((e) => e.awake)) handle = win.requestAnimationFrame(tick);
  };

  const tick = (now: number) => {
    handle = null;
    const run = entries.filter((e) => e.awake);
    for (const e of run) {
      e.awake = false;
      const dt = e.last > 0 ? Math.min(250, Math.max(0, now - e.last)) : 1000 / 60;
      e.last = now;
      try {
        if (e.fn(now, dt) === true) e.awake = true;
      } catch (error) {
        queueMicrotask(() => {
          throw error;
        });
      }
      if (!e.awake) e.last = 0;
    }
    schedule();
  };

  const drive = (fn: FrameDriverFn, opts: FrameDriverOptions = {}): FrameDriver => {
    const entry: Entry = { fn, order: opts.order ?? 50, seq: seq++, awake: false, last: 0 };
    entries.push(entry);
    entries.sort((a, b) => a.order - b.order || a.seq - b.seq);
    return {
      wake() {
        if (!entries.includes(entry)) return;
        entry.awake = true;
        schedule();
      },
      get awake() {
        return entry.awake;
      },
      stop() {
        const i = entries.indexOf(entry);
        if (i >= 0) entries.splice(i, 1);
        if (handle !== null && !entries.some((e) => e.awake)) {
          win.cancelAnimationFrame(handle);
          handle = null;
        }
      },
    };
  };

  return {
    drive,
    /** Drivers currently registered (tests). */
    get size() {
      return entries.length;
    },
    /** Whether a frame is pending (tests). */
    get pending() {
      return handle !== null;
    },
  };
}

type FrameLoop = ReturnType<typeof createFrameLoop>;
const loops = new WeakMap<object, FrameLoop>();

/**
 * Register a frame driver on `win`'s single loop. SSR-safe: without a window it returns an inert driver.
 */
export function drive(
  fn: FrameDriverFn,
  opts?: FrameDriverOptions,
  win: (Window & typeof globalThis) | undefined = typeof window === 'undefined'
    ? undefined
    : window,
): FrameDriver {
  if (!win || typeof win.requestAnimationFrame !== 'function') {
    return { wake() {}, awake: false, stop() {} };
  }
  let loop = loops.get(win);
  if (!loop) loops.set(win, (loop = createFrameLoop(win)));
  return loop.drive(fn, opts);
}
