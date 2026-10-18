/**
 * "Run this when the visitor is not doing anything": the gate every piece of the
 * globe eversion's main-thread work waits on (amendment 2026-10-18, the owner's
 * "the website remains smooth").
 *
 * The effect does three expensive things on the main thread before a run: it
 * loads and evaluates its chunks, compiles its programs (on WebKit, where the
 * render host is in-thread) and clones the page for the BEFORE picture. Each
 * used to start on a timer or an idle callback with a timeout, and a timeout is
 * exactly what fires in the middle of a scroll, or of a drag on the hub's globe -
 * a drag fires no new press, so "no input lately" alone does not see it. Here a
 * pointer that is DOWN (pressed and not yet released) holds everything, any
 * scroll, wheel, touch, press or key restarts the clock, and once the page has
 * been still for `quietMs` the work runs in an idle slot where the browser has
 * one (WebKit has none: there the quiet window is the idle signal).
 *
 * No `pointermove` listener: nothing here reacts to where the pointer is
 * (design-language §5.1.1), only to whether it is held.
 *
 * Shell-safe: a plain module with no imports, small enough for `RadialHub`'s
 * static closure; `EversionBridge` and `useBeforeCapture` use it from the lazy half.
 */

type Listen = Pick<EventTarget, 'addEventListener' | 'removeEventListener'>;

export interface QuietOptions {
  /** How long the page must have been still. */
  quietMs: number;
  /** Something else that must not be interrupted (the hub being open, say): checked when the quiet window ends. */
  busy?: () => boolean;
  /** Ceiling on the wait for an idle slot once quiet, where `requestIdleCallback` exists. */
  idleTimeoutMs?: number;
  /** Test seams: the event target (default `window`) and the idle-callback pair (default the window's, if any). */
  target?: Listen;
  requestIdle?: ((cb: () => void, opts?: { timeout: number }) => number) | null;
  cancelIdle?: ((handle: number) => void) | null;
}

/** Inputs that mean "the visitor is doing something": each restarts the quiet window. */
const RESTART = ['scroll', 'wheel', 'touchstart', 'keydown'] as const;

/**
 * Run `fn` once, after the page has been still for `quietMs` with no pointer held
 * (and `busy()` false), in an idle slot where there is one. Returns a cancel.
 */
export function whenQuiet(fn: () => void, options: QuietOptions): () => void {
  const w = (typeof window === 'undefined' ? undefined : window) as
    | (Window & {
        requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
        cancelIdleCallback?: (handle: number) => void;
      })
    | undefined;
  const target: Listen | undefined = options.target ?? w;
  const requestIdle =
    options.requestIdle === undefined ? w?.requestIdleCallback?.bind(w) : options.requestIdle;
  const cancelIdle =
    options.cancelIdle === undefined ? w?.cancelIdleCallback?.bind(w) : options.cancelIdle;
  const listen = { capture: true, passive: true } as const;

  let timer: ReturnType<typeof setTimeout> | undefined;
  let idle: number | undefined;
  let held = false;
  let done = false;

  const clear = () => {
    if (timer !== undefined) clearTimeout(timer);
    if (idle !== undefined) cancelIdle?.(idle);
    timer = undefined;
    idle = undefined;
  };
  const stop = () => {
    clear();
    if (!target) return;
    for (const e of RESTART) target.removeEventListener(e, restart, listen);
    target.removeEventListener('pointerdown', press, listen);
    target.removeEventListener('pointerup', lift, listen);
    target.removeEventListener('pointercancel', lift, listen);
  };
  const fire = () => {
    if (done) return;
    done = true;
    stop();
    fn();
  };
  function restart() {
    if (done) return;
    clear();
    if (held) return; // `lift` restarts the window
    timer = setTimeout(() => {
      timer = undefined;
      if (held) return;
      if (options.busy?.()) return restart();
      if (requestIdle) idle = requestIdle(fire, { timeout: options.idleTimeoutMs ?? 1000 });
      else fire();
    }, options.quietMs);
  }
  function press() {
    held = true;
    clear();
  }
  function lift() {
    held = false;
    restart();
  }

  if (target) {
    for (const e of RESTART) target.addEventListener(e, restart, listen);
    target.addEventListener('pointerdown', press, listen);
    target.addEventListener('pointerup', lift, listen);
    target.addEventListener('pointercancel', lift, listen);
  }
  restart();
  return () => {
    done = true;
    stop();
  };
}
