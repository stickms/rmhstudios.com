'use client';

import { useEffect, useState } from 'react';

/**
 * Deadline after which an unrevealed section is shown regardless. Long enough
 * that a normal scroll-triggered reveal always wins the race (so the animation
 * is never cut short), short enough that a stuck section is never a page the
 * user has to stare at.
 */
const REVEAL_DEADLINE_MS = 1500;

/**
 * Fail-open safety net for scroll-triggered reveals.
 *
 * `Reveal`/`RevealGroup` start at `opacity: 0` and rely on framer's
 * IntersectionObserver to bring them in. When that observer never fires the
 * content is simply gone — and it doesn't fire in more situations than it
 * looks: full-page screenshot capture, print, any environment that doesn't
 * scroll, and sections whose scroll container isn't the one the observer
 * watches. The audit found /pricing's entire plan grid and every body section
 * of /rmh-capital sitting at opacity 0 that way, around a ~4,700px void.
 *
 * So reveal is now an enhancement with a deadline rather than a gate: if
 * nothing has revealed a section within {@link REVEAL_DEADLINE_MS}, or the page
 * is about to be printed, it is shown. Returns whether that override is active.
 *
 * (The no-JS case is covered separately, by the `noscript` rule in
 * `app/routes/__root.tsx` keyed on `[data-reveal]`.)
 */
export function useRevealWatchdog(): boolean {
  const [forced, setForced] = useState(false);

  useEffect(() => {
    if (forced) return;
    const show = () => setForced(true);
    const timer = setTimeout(show, REVEAL_DEADLINE_MS);
    // Printing takes a snapshot without scrolling, so nothing below the fold
    // would ever have been revealed.
    window.addEventListener('beforeprint', show);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('beforeprint', show);
    };
  }, [forced]);

  return forced;
}
