'use client';

/**
 * LibraryReveal — coordinated, document-order entrance animation for the library.
 *
 * The library page is built from independently-loaded pieces (blog row, the
 * collections shelf, the curated/community book shelves) that finish loading at
 * different times. If each piece animated itself on mount, they'd cascade out of
 * order — books often appear before the (client-fetched) collections above them.
 *
 * Instead, every animatable item registers with a single shared
 * IntersectionObserver. When items scroll into view they are revealed in true
 * visual order (top-to-bottom, then left-to-right), so the page always animates
 * blog → collections → books down the page — and only as each row enters the
 * viewport ("lazy"), no matter which data finished loading first.
 *
 * Reveal state lives in a `data-revealed` attribute (not a class) set imperatively
 * here. React owns the `className` of these items and rewrites it whenever a class
 * it manages changes (e.g. the `is-dragging` / `is-drag-over` classes during admin
 * drag-and-drop reordering). If the revealed state were a class, that rewrite would
 * silently drop it and the item would snap back to `opacity: 0` mid-drag — i.e. the
 * book would "disappear". A data attribute is invisible to React's className
 * reconciliation, so it survives those updates.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from 'react';

const STEP_MS = 45;
const MAX_STEPS = 16;

type RevealApi = {
  observe: (el: HTMLElement) => void;
  unobserve: (el: HTMLElement) => void;
};

const RevealCtx = createContext<RevealApi | null>(null);

export function LibraryRevealProvider({ children }: { children: ReactNode }) {
  const observerRef = useRef<IntersectionObserver | null>(null);
  // Elements registered (possibly before the observer exists, since children's
  // ref callbacks run before this provider's effect).
  const registered = useRef<Set<HTMLElement>>(new Set());
  // Items that became visible this frame, flushed together so a batch cascades.
  const pending = useRef<HTMLElement[]>([]);
  const frame = useRef<number | null>(null);

  const flush = useCallback(() => {
    frame.current = null;
    const batch = pending.current;
    pending.current = [];
    if (batch.length === 0) return;
    // Reveal in visual reading order so the cascade always flows down the page.
    batch.sort((a, b) => {
      const ra = a.getBoundingClientRect();
      const rb = b.getBoundingClientRect();
      return ra.top - rb.top || ra.left - rb.left;
    });
    batch.forEach((el, i) => {
      el.style.animationDelay = `${Math.min(i, MAX_STEPS) * STEP_MS}ms`;
      el.dataset.revealed = 'true';
    });
  }, []);

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') {
      // No observer support: just show everything.
      registered.current.forEach((el) => {
        el.dataset.revealed = 'true';
      });
      return;
    }
    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    const obs = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const el = entry.target as HTMLElement;
          obs.unobserve(el);
          registered.current.delete(el);
          if (reduce) {
            el.dataset.revealed = 'true';
            continue;
          }
          pending.current.push(el);
        }
        if (pending.current.length > 0 && frame.current == null) {
          frame.current = requestAnimationFrame(flush);
        }
      },
      { threshold: 0.05, rootMargin: '0px 0px -8% 0px' },
    );
    observerRef.current = obs;
    // Observe anything that registered before this effect ran.
    registered.current.forEach((el) => obs.observe(el));

    return () => {
      obs.disconnect();
      observerRef.current = null;
      if (frame.current != null) cancelAnimationFrame(frame.current);
      frame.current = null;
    };
  }, [flush]);

  const api = useMemo<RevealApi>(
    () => ({
      observe: (el) => {
        registered.current.add(el);
        observerRef.current?.observe(el);
      },
      unobserve: (el) => {
        registered.current.delete(el);
        observerRef.current?.unobserve(el);
      },
    }),
    [],
  );

  return <RevealCtx.Provider value={api}>{children}</RevealCtx.Provider>;
}

/**
 * Returns a ref callback to attach to an animatable element. The element starts
 * hidden (via the `.lib-reveal` class) and animates in when the shared observer
 * reveals it. Outside a provider it's a no-op (elements just stay visible).
 */
export function useReveal() {
  const api = useContext(RevealCtx);
  const elRef = useRef<HTMLElement | null>(null);
  return useCallback(
    (el: HTMLElement | null) => {
      if (el) {
        elRef.current = el;
        api?.observe(el);
      } else {
        if (elRef.current) api?.unobserve(elRef.current);
        elRef.current = null;
      }
    },
    [api],
  );
}
