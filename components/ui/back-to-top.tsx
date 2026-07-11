'use client';

import { useCallback, useEffect, useState } from 'react';
import { ArrowUp } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/utils';
import { prefersReducedMotion } from '@/hooks/useReducedMotion';

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
          aria-label={t('back-to-top', { defaultValue: 'Back to top' })}
          title={t('back-to-top', { defaultValue: 'Back to top' })}
          initial={{ opacity: 0, scale: 0.8, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.8, y: 8 }}
          transition={{ duration: 0.15, ease: 'easeOut' }}
          className={cn(
            'fixed right-4 bottom-20 z-40 md:right-6 md:bottom-6',
            'flex size-11 items-center justify-center rounded-full',
            'bg-site-surface text-site-text shadow-site',
            'border border-site-border hover:border-site-accent hover:bg-site-surface-hover',
            'active:scale-95 transition-colors',
          )}
        >
          <ArrowUp className="h-5 w-5" aria-hidden />
        </motion.button>
      )}
    </AnimatePresence>
  );
}
