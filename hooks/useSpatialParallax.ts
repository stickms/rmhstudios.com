import { useEffect } from 'react';

/**
 * Drives the restrained background parallax used by the spatial-minimal shell.
 * The listener is shared at the provider level, writes composited CSS variables,
 * and stands down for reduced-motion users. Pointer depth is fine-pointer only;
 * scroll depth works across the public marketing pages on every device.
 */
export function useSpatialParallax() {
  useEffect(() => {
    const root = document.documentElement;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const finePointer = window.matchMedia('(pointer: fine)');
    let pointerFrame = 0;
    let scrollFrame = 0;

    const resetPointer = () => {
      root.style.removeProperty('--spatial-parallax-x');
      root.style.removeProperty('--spatial-parallax-y');
    };

    const resetScroll = () => {
      root.style.removeProperty('--spatial-scroll-y');
    };

    const onPointerMove = (event: PointerEvent) => {
      if (reduced.matches || !finePointer.matches) {
        resetPointer();
        return;
      }
      if (pointerFrame) cancelAnimationFrame(pointerFrame);
      pointerFrame = requestAnimationFrame(() => {
        const x = (event.clientX / window.innerWidth - 0.5) * 18;
        const y = (event.clientY / window.innerHeight - 0.5) * 18;
        root.style.setProperty('--spatial-parallax-x', `${x.toFixed(2)}px`);
        root.style.setProperty('--spatial-parallax-y', `${y.toFixed(2)}px`);
        pointerFrame = 0;
      });
    };

    const onScroll = (event?: Event) => {
      if (reduced.matches) {
        resetScroll();
        return;
      }
      if (scrollFrame) cancelAnimationFrame(scrollFrame);
      scrollFrame = requestAnimationFrame(() => {
        const target = event?.target;
        const scrollTop =
          target instanceof HTMLElement && target.scrollTop > 0 ? target.scrollTop : window.scrollY;
        root.style.setProperty('--spatial-scroll-y', `${Math.min(scrollTop, 2400).toFixed(1)}px`);
        scrollFrame = 0;
      });
    };

    const onPreferenceChange = () => {
      if (reduced.matches) {
        resetPointer();
        resetScroll();
        return;
      }
      if (!finePointer.matches) resetPointer();
      onScroll();
    };

    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('scroll', onScroll, { passive: true, capture: true });
    reduced.addEventListener('change', onPreferenceChange);
    finePointer.addEventListener('change', onPreferenceChange);
    onScroll();

    return () => {
      if (pointerFrame) cancelAnimationFrame(pointerFrame);
      if (scrollFrame) cancelAnimationFrame(scrollFrame);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('scroll', onScroll, { capture: true });
      reduced.removeEventListener('change', onPreferenceChange);
      finePointer.removeEventListener('change', onPreferenceChange);
      resetPointer();
      resetScroll();
    };
  }, []);
}
