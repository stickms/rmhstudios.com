import type { PrepaintCtx } from './types';

/**
 * Must precede every <img>: marks images as their bytes land so they fade in
 * instead of popping in on a slow connection. The full rationale (fail-open
 * rules, LCP exemption, opt-out) lives in `lib/media-reveal.ts`.
 */
export function mediaRevealStep({
  doc,
  html,
}: PrepaintCtx): void {
  const m =
    (
      e: Event,
    ) => {
      const t =
        e.target as Element | null;
      if (
        t &&
        t.tagName ===
          'IMG' &&
        !t.hasAttribute(
          'data-loaded',
        )
      )
        t.setAttribute(
          'data-loaded',
          '',
        );
    };
  doc.addEventListener(
    'load',
    m,
    true,
  );
  doc.addEventListener(
    'error',
    m,
    true,
  );
  html.classList.add(
    'media-reveal',
  );
}
