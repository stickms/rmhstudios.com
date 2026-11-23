import { useEffect, useRef, useState } from 'react';
import { createTween, type TweenFrame } from './tween';

/**
 * The y scale of a chart, tweened (owner O7). The server render and the first client render return the target as is,
 * so the first paint never animates. A later change of `target` runs one tween (`tween.ts`: 280 ms, ease-out, nothing
 * pending afterwards). Under `prefers-reduced-motion: reduce` the change is instant: this is M7's rule applied to this
 * tween, and no setting or OS override beyond it. See `features/medschools/CLAUDE.md` (O7).
 */
export function useTween(target: number): TweenFrame {
  const [frame, setFrame] = useState<TweenFrame>({ value: target, from: target, to: target, p: 1 });
  const tween = useRef<ReturnType<typeof createTween> | null>(null);

  useEffect(() => {
    const c = createTween({
      initial: target,
      onFrame: setFrame,
      scheduler: {
        now: () => performance.now(),
        request: (cb) => requestAnimationFrame(cb),
        cancel: (h) => cancelAnimationFrame(h),
      },
    });
    tween.current = c;
    return () => {
      c.stop();
      tween.current = null;
    };
    // The controller is made once; the target effect below drives it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const reduce =
      typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    tween.current?.set(target, reduce);
  }, [target]);

  // Until the effect has started the tween the frame still holds the old target: show it as p = 0 of the new one, so
  // a toggle never paints one frame at the final scale.
  return frame.to === target ? frame : { value: frame.value, from: frame.to, to: target, p: 0 };
}
