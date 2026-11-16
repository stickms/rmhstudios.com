/**
 * RMH PMC layout shell — scopes the design system under `.rmhp-root`, renders
 * the glass command capsule, the document gutter and the footer.
 *
 * Motion is CSS (rmh-pmc.css). The scripts are here:
 *  - `useChromePointer`: one delegated passive `pointermove` that writes
 *    `--rp-mx` on the `[data-chrome-live]` surface under the pointer, so its
 *    reflection follows. No frame loop.
 *  - `useSceneFocus`: one delegated `focusin`. Pinned steps are stacked and
 *    fade in and out with scroll, so a step that receives keyboard focus while
 *    it is not the live one would be invisible. Focus scrolls the scene to the
 *    middle of that step's `--a…--b` window instead.
 */
import { useEffect, useRef } from 'react';
import { Outlet } from '@tanstack/react-router';
import { useChromePointer } from '@/hooks/useChromePointer';
import { CommandBar, Gutter, SiteFooter } from './shared';

function useSceneFocus(root: React.RefObject<HTMLDivElement | null>) {
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

export default function RmhPmcLayout() {
  const root = useRef<HTMLDivElement>(null);
  useChromePointer(root, '--rp-mx');
  useSceneFocus(root);
  return (
    <div className="rmhp-root" ref={root}>
      <CommandBar />
      <Gutter />
      <main>
        <Outlet />
      </main>
      <SiteFooter />
    </div>
  );
}
