import type { PrepaintCtx } from './types';

/**
 * Must precede every <img>: marks images as their bytes land so they fade in
 * instead of popping in on a slow connection. The full rationale (fail-open
 * rules, LCP exemption, opt-out, why a picture that is already there never
 * fades) lives in `lib/media-reveal.ts`.
 */
export function mediaRevealStep({ doc, html, win }: PrepaintCtx): void {
  const m = (e: Event) => {
    const t = e.target as Element | null;
    if (!t || t.tagName !== 'IMG' || t.hasAttribute('data-loaded')) return;
    // Only a picture the wait had already hidden fades in. One that loaded inside the wait (cached, or remounted by a
    // tab switch or a navigation) was never hidden and simply stays shown.
    let hidden = false;
    try {
      hidden = win.getComputedStyle(t).opacity === '0';
    } catch {
      // Fail open: no fade.
    }
    t.setAttribute('data-loaded', hidden ? 'reveal' : '');
  };
  doc.addEventListener('load', m, true);
  doc.addEventListener('error', m, true);
  html.classList.add('media-reveal');
}
