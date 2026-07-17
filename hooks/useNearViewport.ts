'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';

/**
 * Fire only when an element approaches the viewport.
 *
 * Attach the returned `ref` to the element to watch; `visible` flips to true
 * once it comes within `rootMargin` of the viewport (and stays true). Used to
 * defer per-card side effects — link-preview and GIF resolution fetches — so a
 * first feed page doesn't fan out N requests during hydration for cards that are
 * far below the fold. Mirrors the view-beacon gate in RMHarkCard.
 *
 * Pass `skip = true` to opt out entirely (e.g. the data is already cached):
 * `visible` starts true and no observer is created. Environments without
 * IntersectionObserver also resolve to visible immediately so nothing is
 * silently dropped.
 */
export function useNearViewport<T extends HTMLElement = HTMLDivElement>(
  rootMargin = '400px 0px',
  skip = false,
): { ref: RefObject<T | null>; visible: boolean } {
  const ref = useRef<T | null>(null);
  const [visible, setVisible] = useState(skip);

  useEffect(() => {
    if (skip || visible) return;
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          io.disconnect();
        }
      },
      { rootMargin },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [rootMargin, skip, visible]);

  return { ref, visible };
}
