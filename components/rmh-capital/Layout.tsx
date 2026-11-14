/**
 * RMH Capital layout shell — scopes the design system under `.rmhc-root` and
 * renders the shared nav and footer.
 *
 * Motion is CSS (rmh-capital.css). The one script is here: a single delegated
 * `pointermove` listener that tells the chrome surface under the pointer where
 * the pointer is (`--rc-mx`, -1 at its left edge to 1 at its right), so the
 * reflection on it follows. There is no frame loop: the browser delivers
 * `pointermove` at most once a frame, and the CSS eases the value. A surface
 * opts in with `data-chrome-live`.
 */
import { useEffect, useRef } from 'react';
import { Outlet } from '@tanstack/react-router';
import { TopNav, SiteFooter } from './shared';

function useChromePointer(root: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;

    let last: HTMLElement | null = null;
    const settle = () => {
      last?.style.setProperty('--rc-mx', '0');
      last = null;
    };
    const onMove = (e: PointerEvent) => {
      const target = e.target instanceof Element ? e.target : null;
      const surface = target?.closest<HTMLElement>('[data-chrome-live]') ?? null;
      if (surface !== last) settle();
      if (!surface) return;
      last = surface;
      const box = surface.getBoundingClientRect();
      if (box.width === 0) return;
      const x = ((e.clientX - box.left) / box.width) * 2 - 1;
      surface.style.setProperty('--rc-mx', x.toFixed(3));
    };

    el.addEventListener('pointermove', onMove, { passive: true });
    el.addEventListener('pointerleave', settle);
    return () => {
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerleave', settle);
      settle();
    };
  }, [root]);
}

export default function RmhCapitalLayout() {
  const root = useRef<HTMLDivElement>(null);
  useChromePointer(root);

  return (
    <div className="rmhc-root" ref={root}>
      <TopNav />
      <main>
        <Outlet />
      </main>
      <SiteFooter />
    </div>
  );
}
