'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Infinite-scroll trigger: call `onVisible` whenever the returned element comes
 * within `rootMargin` of the viewport (or of its scroll container).
 *
 * Attach the returned callback ref to an empty element placed after the list.
 * An observer only reports *changes*, so a sentinel that is still on screen
 * after a batch loads would never fire again; `watch` (usually the number of
 * rows rendered) re-arms the observer each time it changes, which makes it
 * report the sentinel's current state again.
 *
 * Environments without IntersectionObserver call `onVisible` once, so a list
 * still loads rather than stopping at its first page.
 */
export function useSentinel(
  onVisible: () => void,
  {
    enabled = true,
    watch,
    rootMargin = '600px 0px',
  }: { enabled?: boolean; watch?: unknown; rootMargin?: string } = {},
): (el: HTMLElement | null) => void {
  const handler = useRef(onVisible);
  useEffect(() => {
    handler.current = onVisible;
  });
  const [el, setEl] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (!enabled || !el) return;
    if (typeof IntersectionObserver === 'undefined') {
      handler.current();
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) handler.current();
      },
      { rootMargin },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [el, enabled, rootMargin, watch]);

  return setEl;
}
