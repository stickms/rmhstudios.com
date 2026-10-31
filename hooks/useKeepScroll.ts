'use client';

import { useEffect, type RefObject } from 'react';
import { useRouter } from '@tanstack/react-router';

/**
 * Keep an inner scroll container where the member left it across navigations.
 *
 * The router watches elements that scroll, remembers them per location and rewrites them on
 * the next navigation, and for a persistent sidebar it writes 0, so choosing a game sent the
 * list back to the top. Two things here, because the router's write can land in more than one
 * place: the position is tracked only from the member's own scrolling (events during a
 * navigation are ignored, since the router's reset produces one), and it is put back as soon as
 * the page has rendered, again in a microtask and after a short timeout. The ref is read when an
 * event fires, never captured, because the node can be replaced.
 */
export function useKeepScroll(ref: RefObject<HTMLElement | null>) {
  const router = useRouter();

  useEffect(() => {
    let saved = ref.current?.scrollTop ?? 0;
    let navigating = false;
    const restore = () => {
      const el = ref.current;
      if (el?.isConnected && el.scrollTop !== saved) el.scrollTop = saved;
    };
    const onScroll = (e: Event) => {
      const el = ref.current;
      if (!el || e.target !== el) return;
      if (!navigating) saved = el.scrollTop;
      // The router never hears about this element's scrolling.
      e.stopPropagation();
    };
    window.addEventListener('scroll', onScroll, true);
    const offBefore = router.subscribe('onBeforeLoad', () => {
      navigating = true;
    });
    // One short timeout, not a frame loop: long enough for the router's reset and the scroll
    // event it causes to have happened, short enough to be invisible.
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const after = (fn: () => void) => {
      const t = setTimeout(() => {
        timers.delete(t);
        fn();
      }, 40);
      timers.add(t);
    };
    const offRendered = router.subscribe('onRendered', () => {
      restore();
      queueMicrotask(restore);
      after(() => {
        restore();
        navigating = false;
      });
    });
    const offResolved = router.subscribe('onResolved', () => {
      after(() => {
        navigating = false;
      });
    });
    return () => {
      for (const t of timers) clearTimeout(t);
      window.removeEventListener('scroll', onScroll, true);
      offBefore();
      offRendered();
      offResolved();
    };
  }, [ref, router]);
}
