'use client';

import { useEffect, useRef } from 'react';

/**
 * The site's one reveal-on-scroll (audit SPA-003).
 *
 * Attach the returned ref to a container; every descendant carrying
 * `.site-reveal` fades and rises into place as it enters the viewport, on the
 * single curve defined by `--site-reveal-*` in `app/globals.css`.
 *
 * ```tsx
 * const ref = useReveal<HTMLDivElement>();
 * <section ref={ref}>
 *   <h2 className="site-reveal site-display-2">…</h2>
 *   <p className="site-reveal" style={{ '--site-reveal-delay': '90ms' }}>…</p>
 * </section>
 * ```
 *
 * ## Why the hidden state is opt-IN
 *
 * The hook sets `data-reveal-armed` on the container **after** it has an
 * observer watching, and the CSS only hides `.site-reveal` under that attribute.
 * So the resting state of the markup is *visible*, and content can only be
 * hidden by a mechanism that is already able to show it again.
 *
 * That inverts the failure mode this replaces. Five separate implementations
 * (`rmh-capital/shared`, `rmh-pmc/shared`, `LibraryReveal`, framer `whileInView`
 * in `MembershipPanel`, `MDXAnimations`, `RoadmapSection`) each defaulted to
 * `opacity: 0` and relied on JS to undo it — which is AUD-006 in the 2026-07-28
 * audit: `/pricing`'s entire plan grid and ~4,700px of `/rmh-capital` rendered
 * blank in print, in full-page capture, in reader mode, pre-hydration, and any
 * time the observer didn't fire. Here, if JS never runs, everything shows.
 *
 * Reduced motion skips arming entirely — no hidden state, no transition, nothing
 * to undo.
 */
export function useReveal<T extends HTMLElement = HTMLElement>() {
  const ref = useRef<T>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    if (typeof IntersectionObserver === 'undefined') return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

    const targets = Array.from(root.querySelectorAll<HTMLElement>('.site-reveal'));
    if (targets.length === 0) return;

    // Arm first, then observe: the hidden state and the observer that clears it
    // are turned on in the same tick, so nothing can be left hidden.
    root.dataset.revealArmed = '';

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          (entry.target as HTMLElement).dataset.visible = '';
          observer.unobserve(entry.target);
        }
      },
      { threshold: 0.12, rootMargin: '0px 0px -7% 0px' },
    );
    for (const target of targets) observer.observe(target);

    return () => {
      observer.disconnect();
      // Leave nothing hidden behind us if the tree survives the unmount.
      delete root.dataset.revealArmed;
    };
  }, []);

  return ref;
}
