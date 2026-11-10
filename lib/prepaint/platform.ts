import type { PrepaintCtx } from './types';

/**
 * Mark iOS WebKit before first paint so its compositor-safe glass tier applies
 * before any fixed aurora, SVG lens, or backdrop-filter animation is created.
 * iPadOS may present a desktop Macintosh UA, hence the touch-point fallback.
 */
export function platformStep({ html, nav }: PrepaintCtx): void {
  const u = nav.userAgent || '';
  const ios = /iPhone|iPad|iPod/.test(u) || (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1);
  const wk =
    u.indexOf('AppleWebKit') !== -1 &&
    u.indexOf('Chrome/') === -1 &&
    u.indexOf('Chromium') === -1 &&
    u.indexOf('Edg/') === -1 &&
    u.indexOf('OPR/') === -1;
  if (ios && wk) html.classList.add('ios-webkit');
}
