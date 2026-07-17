'use client';

import { useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const THRESHOLD = 72; // px of (damped) pull needed to commit to a refresh
const MAX_PULL = 112; // cap on how far the content follows the finger
const DAMPING = 0.5; // rubber-band resistance on the raw finger delta
const REST = 56; // where the content sits while the spinner runs
const MIN_SPIN_MS = 500; // floor so a fast refresh doesn't flash the spinner

/**
 * Swipe-down-to-refresh for the mobile feed, matching the native app pattern.
 *
 * The gesture listens on the mobile shell's scroll container
 * (`[data-scroll-root]`), so it's naturally inert on desktop (window scroll, no
 * such element). It only engages on a downward drag that STARTS at the very top
 * of the scroller, and it bails the moment the browser won't let it
 * `preventDefault()` (i.e. once the native rubber-band has committed) — so it
 * never fights the shell's drawer/scroll gestures or the browser's own scroll.
 * The existing shell handler classifies a vertical-down swipe as `scroll` and
 * does nothing, leaving the boundary pull to us.
 */
export function PullToRefresh({
  onRefresh,
  children,
}: {
  onRefresh: () => Promise<void> | void;
  children: React.ReactNode;
}) {
  const { t } = useTranslation('feed');
  const containerRef = useRef<HTMLDivElement>(null);
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [dragging, setDragging] = useState(false);

  // Refs mirror state so the once-bound native listeners never read stale values.
  const pullRef = useRef(0);
  const refreshingRef = useRef(false);
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  const setPullBoth = (v: number) => {
    pullRef.current = v;
    setPull(v);
  };

  useEffect(() => {
    const scroller = containerRef.current?.closest<HTMLElement>('[data-scroll-root]');
    if (!scroller) return; // desktop / no mobile scroll root → PTR disabled

    const g = { startY: 0, active: false };

    const onStart = (e: TouchEvent) => {
      const touch = e.touches[0];
      if (refreshingRef.current || e.touches.length !== 1 || !touch || scroller.scrollTop > 0) {
        g.active = false;
        return;
      }
      g.startY = touch.clientY;
      g.active = true;
    };

    const onMove = (e: TouchEvent) => {
      if (!g.active || refreshingRef.current) return;
      const touch = e.touches[0];
      if (e.touches.length !== 1 || !touch) {
        g.active = false;
        setDragging(false);
        setPullBoth(0);
        return;
      }
      const dy = touch.clientY - g.startY;
      // Pulling up, or the scroller left the top → hand back to normal scroll.
      if (dy <= 0 || scroller.scrollTop > 0) {
        if (pullRef.current) setPullBoth(0);
        setDragging(false);
        g.active = false;
        return;
      }
      // Only take the gesture while the browser still lets us cancel it (before
      // the native overscroll commits). Otherwise bail — no pull, no breakage.
      if (!e.cancelable) {
        if (pullRef.current) setPullBoth(0);
        setDragging(false);
        g.active = false;
        return;
      }
      e.preventDefault();
      if (!dragging) setDragging(true);
      setPullBoth(Math.min(MAX_PULL, dy * DAMPING));
    };

    const onEnd = () => {
      if (!g.active) return;
      g.active = false;
      setDragging(false);
      if (pullRef.current >= THRESHOLD) {
        refreshingRef.current = true;
        setRefreshing(true);
        setPullBoth(REST);
        const started = performance.now();
        Promise.resolve(onRefreshRef.current())
          .catch(() => {})
          .then(() => {
            const wait = Math.max(0, MIN_SPIN_MS - (performance.now() - started));
            window.setTimeout(() => {
              refreshingRef.current = false;
              setRefreshing(false);
              setPullBoth(0);
            }, wait);
          });
      } else {
        setPullBoth(0);
      }
    };

    scroller.addEventListener('touchstart', onStart, { passive: true });
    scroller.addEventListener('touchmove', onMove, { passive: false });
    scroller.addEventListener('touchend', onEnd, { passive: true });
    scroller.addEventListener('touchcancel', onEnd, { passive: true });
    return () => {
      scroller.removeEventListener('touchstart', onStart);
      scroller.removeEventListener('touchmove', onMove);
      scroller.removeEventListener('touchend', onEnd);
      scroller.removeEventListener('touchcancel', onEnd);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const progress = Math.min(1, pull / THRESHOLD);

  return (
    <div ref={containerRef} className="relative">
      {/* Revealed strip at the very top; grows with the pull and holds the
          spinner. aria-hidden — the sr-only status below announces the refresh. */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-center overflow-hidden"
        style={{ height: pull }}
        aria-hidden
      >
        <div className="mt-2 flex size-9 items-center justify-center rounded-full border border-site-border bg-site-surface shadow-site">
          <RefreshCw
            className={`size-5 text-site-accent ${refreshing ? 'animate-spin' : ''}`}
            style={
              refreshing
                ? undefined
                : { transform: `rotate(${progress * 270}deg)`, opacity: 0.4 + progress * 0.6 }
            }
          />
        </div>
      </div>

      <div
        className={dragging ? '' : 'transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none'}
        style={{ transform: pull ? `translateY(${pull}px)` : undefined }}
      >
        {children}
      </div>

      {refreshing && (
        <span className="sr-only" role="status">
          {t('refreshing', { defaultValue: 'Refreshing feed' })}
        </span>
      )}
    </div>
  );
}
