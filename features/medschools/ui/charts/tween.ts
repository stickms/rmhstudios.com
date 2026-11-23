import { lerp } from '@/lib/core/math';
import { easeOutCubic } from '../../engine/chart-geometry';

/**
 * One number tweening to a new target (owner O7, 2026-11-23): the chart's y scale. A response to input only: nothing
 * is scheduled until `set` is given a different target, one frame is requested at a time, and the last frame
 * requests no successor, so a chart at rest has no callback pending (R5). 280 ms with ease-out, inside R5's 360 ms.
 * The scheduler is injected so the settle is testable without a browser.
 */
export const TWEEN_MS = 280;

export interface TweenFrame {
  /** The value to draw this frame. */
  value: number;
  /** The target the tween left, the one it is heading to, and the eased progress between them (1 at rest). */
  from: number;
  to: number;
  p: number;
}

export interface TweenScheduler {
  now: () => number;
  request: (cb: () => void) => number;
  cancel: (handle: number) => void;
}

export function createTween(opts: {
  initial: number;
  onFrame: (f: TweenFrame) => void;
  scheduler: TweenScheduler;
  duration?: number;
}) {
  const { scheduler, onFrame } = opts;
  const duration = opts.duration ?? TWEEN_MS;
  let frame: TweenFrame = { value: opts.initial, from: opts.initial, to: opts.initial, p: 1 };
  let start = 0;
  let startValue = opts.initial;
  let handle: number | null = null;

  const tick = () => {
    handle = null;
    const raw = (scheduler.now() - start) / duration;
    const p = easeOutCubic(raw);
    frame = { value: lerp(startValue, frame.to, p), from: frame.from, to: frame.to, p };
    if (raw >= 1) frame = { value: frame.to, from: frame.to, to: frame.to, p: 1 };
    onFrame(frame);
    if (raw < 1) handle = scheduler.request(tick);
  };

  return {
    get frame() {
      return frame;
    },
    /** Head for `target`. `instant` (reduced motion) jumps there with no frame request at all. */
    set(target: number, instant = false) {
      if (target === frame.to) return;
      if (handle !== null) scheduler.cancel(handle);
      handle = null;
      if (instant || duration <= 0) {
        frame = { value: target, from: target, to: target, p: 1 };
        onFrame(frame);
        return;
      }
      // An interrupted tween continues from where it is drawn, so a second toggle never jumps.
      startValue = frame.value;
      start = scheduler.now();
      frame = { value: startValue, from: frame.to, to: target, p: 0 };
      onFrame(frame);
      handle = scheduler.request(tick);
    },
    stop() {
      if (handle !== null) scheduler.cancel(handle);
      handle = null;
    },
    get pending() {
      return handle !== null;
    },
  };
}
