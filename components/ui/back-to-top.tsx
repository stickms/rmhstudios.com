'use client';

import { useCallback, useEffect, useState } from 'react';
import { ArrowUp } from 'lucide-react';
import { AnimatePresence, m as motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/utils';
import { prefersReducedMotion } from '@/hooks/useReducedMotion';
import { DURATION, EASE } from '@/lib/motion';

/**
 * Floating "back to top" button. Appears once the page is scrolled past
 * `threshold`, and jumps the active scroller to the top on click.
 *
 * Handles both scroll containers the app uses: the window on desktop and the
 * `[data-scroll-root]` element (MobileSidebarShell) on mobile — the same
 * targets `useScrollRestoration` tracks. Mounted once in the `_site` shell, so
 * every standard page gets it without opting in.
 */
export function BackToTop({ threshold = 600 }: { threshold?: number }) {
  const { t } = useTranslation('c-ui');
  const [visible, setVisible] = useState(false);

  const currentTop = useCallback((): number => {
    const mobile = document.querySelector<HTMLElement>('[data-scroll-root]');
    if (mobile && mobile.offsetParent !== null) return mobile.scrollTop;
    return window.scrollY;
  }, []);

  useEffect(() => {
    let ticking = false;
    const update = () => {
      ticking = false;
      setVisible(currentTop() > threshold);
    };
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(update);
    };
    // Capture phase so scrolls on the inner mobile container are caught too.
    window.addEventListener('scroll', onScroll, { passive: true, capture: true });
    update();
    return () => window.removeEventListener('scroll', onScroll, true);
  }, [currentTop, threshold]);

  const scrollToTop = useCallback(() => {
    const behavior: ScrollBehavior = prefersReducedMotion() ? 'auto' : 'smooth';
    const mobile = document.querySelector<HTMLElement>('[data-scroll-root]');
    if (mobile && mobile.offsetParent !== null) mobile.scrollTo({ top: 0, behavior });
    else window.scrollTo({ top: 0, behavior });
  }, []);

  return (
    <AnimatePresence>
      {visible && (
        <motion.button
          type="button"
          onClick={scrollToTop}
          // §5.5x A.1: part of the mobile floating-bottom stack. globals.css lifts
          // this above the mini-player / cookie bar when either is present so no two
          // ever overlap at bottom-above-dock.
          data-floating="backtotop"
          aria-label={t('back-to-top', { defaultValue: 'Back to top' })}
          title={t('back-to-top', { defaultValue: 'Back to top' })}
          initial={{ opacity: 0, scale: 0.8, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.8, y: 8 }}
          transition={{ duration: DURATION.fast, ease: EASE.standard }}
          className={cn(
            // Clears the home indicator, iOS Safari's floating tab bar, and any
            // active floating surface via .bottom-above-dock.
            'fixed right-4 bottom-above-dock z-40 md:right-6 md:bottom-6',
            'flex size-11 items-center justify-center rounded-full',
            // Floating L4 glass disc; the always-on optics-ring glint comes free
            // from .glass-overlay. glass-bevel-sm thins the ring (6px) so it fits
            // this small disc instead of the 12px pane default.
            'glass-overlay glass-bevel-sm text-site-text',
            'hover:border-site-accent',
            'active:scale-95',
          )}
        >
          <ArrowUp className="h-5 w-5" aria-hidden />
        </motion.button>
      )}
    </AnimatePresence>
  );
}
