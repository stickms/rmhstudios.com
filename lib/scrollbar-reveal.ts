/**
 * Scrollbars that show on scroll instead of always.
 *
 * The CSS half lives in `app/globals.css` (§Scrollbars): every scrollbar is
 * painted transparent unless its scroller carries `data-scrolling`. This is the
 * runtime that stamps that attribute — installed once from
 * `components/Providers.tsx`, so it covers every route, every app tier, and any
 * scroller mounted later.
 *
 * Three things make it cheap:
 *
 * - **One listener, capture phase.** `scroll` does not bubble from elements, but
 *   it does pass through the capture phase on the way down, so a single
 *   document-level capturing listener sees every scroller on the page without
 *   anyone having to register theirs.
 * - **DOM writes only on the edges.** `scroll` fires every frame of a gesture;
 *   the attribute is written once on idle→active and removed once on
 *   active→idle. In between only a timer is rescheduled.
 * - **No layout.** The attribute drives colour, never `scrollbar-width`, so the
 *   gutter is reserved the whole time and nothing reflows (see the CSS note).
 *
 * `passive: true` because the handler never calls `preventDefault` — this must
 * not add latency to the very gesture it is reacting to.
 */

/** How long a scroller keeps its scrollbar after the last scroll event. */
const IDLE_MS = 900;
const ATTR = 'data-scrolling';

export function installScrollbarReveal(): () => void {
  if (typeof document === 'undefined' || typeof window === 'undefined') return () => {};

  /**
   * Scrollers with a pending hide. A plain `Map` (not a `WeakMap`) so teardown
   * can clear what is outstanding; entries are deleted when their timer fires,
   * so this holds at most the handful of scrollers moving right now — even if a
   * scroller is unmounted mid-gesture, its entry is dropped 900ms later.
   */
  const pending = new Map<Element, number>();

  const hide = (el: Element) => {
    pending.delete(el);
    el.removeAttribute(ATTR);
  };

  const onScroll = (event: Event) => {
    const target = event.target;
    // A document scroll reports `document` as its target; the scrollbar that is
    // actually on screen for it belongs to the root element. `body` is marked
    // too because Chromium propagates the viewport scrollbar's styles from
    // whichever of the two owns the overflow.
    const el: Element | null =
      target instanceof Element ? target : target === document ? document.documentElement : null;
    if (!el) return;

    const timer = pending.get(el);
    if (timer === undefined) el.setAttribute(ATTR, '');
    else window.clearTimeout(timer);
    pending.set(
      el,
      window.setTimeout(() => hide(el), IDLE_MS),
    );

    if (el === document.documentElement && document.body) {
      const body = document.body;
      const bodyTimer = pending.get(body);
      if (bodyTimer === undefined) body.setAttribute(ATTR, '');
      else window.clearTimeout(bodyTimer);
      pending.set(
        body,
        window.setTimeout(() => hide(body), IDLE_MS),
      );
    }
  };

  document.addEventListener('scroll', onScroll, { capture: true, passive: true });

  return () => {
    document.removeEventListener('scroll', onScroll, { capture: true });
    for (const [el, timer] of pending) {
      window.clearTimeout(timer);
      el.removeAttribute(ATTR);
    }
    pending.clear();
  };
}
