/**
 * Keyboard focus inside a pinned scroll scene (`components/shared/scroll-scene.tsx`).
 *
 * Pinned steps are stacked and fade in and out with scroll, so a step that
 * receives keyboard focus while it is not the live one would be invisible. One
 * delegated `focusin` on the microsite root scrolls the scene to the middle of
 * that step's `--a`…`--b` window instead. No frame loop, and nothing happens
 * when the pin is not sticky (flow mode: no scroll timeline, or motion off).
 */
import { useEffect } from 'react';
import type { RefObject } from 'react';

export function useSceneFocus(root: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const onFocusIn = (e: FocusEvent) => {
      const target = e.target instanceof Element ? e.target : null;
      const step = target?.closest<HTMLElement>('[data-step]');
      const scene = step?.closest<HTMLElement>('.scene');
      const pin = scene?.querySelector<HTMLElement>('.scene-pin');
      if (!step || !scene || !pin) return;
      // Only when the pin really is sticky (the motion gate is on).
      if (getComputedStyle(pin).position !== 'sticky') return;
      const a = parseFloat(step.style.getPropertyValue('--a'));
      const b = parseFloat(step.style.getPropertyValue('--b'));
      if (Number.isNaN(a) || Number.isNaN(b)) return;
      const span = scene.offsetHeight - pin.offsetHeight;
      if (span <= 0) return;
      const top = scene.getBoundingClientRect().top + window.scrollY;
      const p = ((window.scrollY - top) / span) * 100;
      if (p >= a + (b - a) * 0.3 && p <= b - (b - a) * 0.3) return; // already live
      window.scrollTo({ top: top + (span * (a + b)) / 200, behavior: 'instant' });
    };
    el.addEventListener('focusin', onFocusIn);
    return () => el.removeEventListener('focusin', onFocusIn);
  }, [root]);
}
