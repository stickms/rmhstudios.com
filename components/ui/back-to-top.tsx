'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowUp } from 'lucide-react';
import { AnimatePresence, m as motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/utils';
import { prefersReducedMotion } from '@/hooks/useReducedMotion';
import { DURATION, EASE } from '@/lib/motion';

/**
 * Floating "back to top" button. Appears once the page is scrolled past
 * `threshold`, and jumps the active scroller to the top on click. Mounted once
 * in the `_site` shell, so every standard page gets it without opting in.
 *
 * Scrolls the window, unless a page has opted into an inner scroller by marking
 * it `[data-scroll-root]` — the same opt-in `useScrollRestoration` honours. No
 * page sets that today (every `_site` page scrolls the document on mobile and
 * desktop alike), so this resolves to the window; the attribute remains the
 * documented escape hatch.
 *
 * ## "Am I scrolled down?" is answered without a scroll listener
 *
 * This component used to run a scroll listener over the whole session that
 * asked "which box is scrolling?" with `document.querySelector` plus an
 * `offsetParent` read, then asked "how far?" with `window.scrollY`. Sampled
 * during a feed scroll, that handler was **41% of all JavaScript time on the
 * page** — the largest scripting cost of scrolling anywhere on the site.
 *
 * The query was the obvious half of the waste (a document-wide attribute
 * selector, per event, to discover the null every shipped page returns). The
 * expensive half was subtler: `window.scrollY` forces style and layout to be
 * brought up to date, and this ran in a `requestAnimationFrame` **after** the
 * feed's rake pass had just written a transform to every card on screen. Every
 * scroll frame therefore paid for a synchronous re-layout of the page, to learn
 * a number that only matters when it crosses one threshold.
 *
 * So there is no scroll listener any more. A 1px sentinel sits `threshold`
 * pixels down the page and an `IntersectionObserver` reports when it leaves —
 * observers run off the main thread's critical path, deliver the geometry they
 * already computed (`boundingClientRect`, so `top < 0` distinguishes "scrolled
 * past it" from "the viewport is shorter than the threshold"), and read
 * nothing. Scrolling now costs this component exactly nothing until the
 * threshold is actually crossed.
 *
 * This also keeps the escape hatch working, and for free: the default root is
 * the VIEWPORT, and intersection accounts for every clipping ancestor along the
 * way — so a shell nested inside an opted-in `[data-scroll-root]` reports
 * correctly without this component having to know the scroller exists. Only the
 * click target still needs to, and that is resolved once, on click.
 */
export function BackToTop({ threshold = 600 }: { threshold?: number }) {
  const { t } = useTranslation('c-ui');
  const [visible, setVisible] = useState(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      // Gone off the TOP, not merely out of view: on a viewport shorter than the
      // threshold the sentinel starts out below the fold, and "not intersecting"
      // there would show the button on an unscrolled page.
      setVisible(!entry.isIntersecting && entry.boundingClientRect.top < 0);
    });
    io.observe(sentinel);
    return () => io.disconnect();
  }, [threshold]);

  const scrollToTop = useCallback(() => {
    const behavior: ScrollBehavior = prefersReducedMotion() ? 'auto' : 'smooth';
    // Resolved here rather than kept live: one query per click is free, and a
    // click is the only moment the answer is needed.
    const scroller = document.querySelector<HTMLElement>('[data-scroll-root]');
    if (scroller && scroller.offsetParent !== null) scroller.scrollTo({ top: 0, behavior });
    else window.scrollTo({ top: 0, behavior });
  }, []);

  return (
    <>
      <div
        ref={sentinelRef}
        className="back-to-top-sentinel"
        style={{ top: `${threshold}px` }}
        aria-hidden
      />
      <AnimatePresence>
        {visible && (
          <motion.button
            type="button"
            onClick={scrollToTop}
            // §5.5x A.1: part of the floating-bottom stack. globals.css lifts this
            // clear of the mini-player / cookie bar when either is present, and
            // `.floating-fab-lane` seats it in the compose FAB's row.
            data-floating="backtotop"
            aria-label={t('back-to-top', { defaultValue: 'Back to top' })}
            title={t('back-to-top', { defaultValue: 'Back to top' })}
            initial={{ opacity: 0, scale: 0.8, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: 8 }}
            transition={{ duration: DURATION.fast, ease: EASE.standard }}
            className={cn(
              // Shares the bottom-right lane with the compose FAB (globals.css
              // §5.5x A.1) instead of floating in the band above it, where it sat
              // on top of page content. The lane carries the safe-area inset, so
              // this still clears the home indicator and iOS Safari's tab bar.
              'floating-fab-lane fixed z-40',
              'flex size-11 items-center justify-center rounded-full',
              // Floating L4 glass disc; the always-on optics-ring glint comes free
              // from .glass-overlay, and .glass-bevel-sm thins the ring (6px) so it
              // fits this small disc instead of the 12px pane default.
              'glass-overlay glass-bevel-sm text-site-text',
              'hover:border-site-accent',
              'active:scale-95',
            )}
          >
            <ArrowUp className="h-5 w-5" aria-hidden />
          </motion.button>
        )}
      </AnimatePresence>
    </>
  );
}
