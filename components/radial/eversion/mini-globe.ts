/**
 * Every non-hub navigation response (amended 2026-10-21): no mini eversion on controls any more.
 *
 * The owner asked for the same "jelly" language as the globe, but for mini interactions to behave like a puddle:
 * taps and clicks radiate from their origin and nearby UI reacts first, with distance falloff. This keeps
 * navigation immediate (nothing held) while still giving tactile feedback across the screen.
 *
 * It is plain DOM + WAAPI, no React work: one fixed ripple layer plus transform-only pulses on nearby controls.
 */

const RIPPLE_MS = 460;
const REACT_MS = 260;
const MAX_REACT = 40;
const BASE_DELAY_MS = 26;
const MAX_DELAY_MS = 170;

let current: { cancel(): void } | null = null;

const REACT_SELECTOR = [
  'a[href]',
  'button',
  '[role="button"]',
  '[role="link"]',
  '[role="menuitem"]',
  '[role="tab"]',
  '[data-evert]',
  '[data-fluid-press]',
].join(',');

function centreOf(el: Element): { x: number; y: number; rect: DOMRect } | null {
  const rect = el.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, rect };
}

/** A puddle ripple from `el`. Returns whether it started. */
export function playMiniEversion(el: Element): boolean {
  if (!el.isConnected) return false;
  const at = centreOf(el);
  if (!at) return false;
  current?.cancel();

  const overlay = document.createElement('div');
  overlay.className = 'evert-mini-ripple';
  overlay.setAttribute('aria-hidden', 'true');
  overlay.style.setProperty('--evert-ripple-x', `${at.x.toFixed(1)}px`);
  overlay.style.setProperty('--evert-ripple-y', `${at.y.toFixed(1)}px`);
  const maxR = Math.hypot(Math.max(at.x, innerWidth - at.x), Math.max(at.y, innerHeight - at.y));
  overlay.style.setProperty('--evert-ripple-r', `${Math.max(1, maxR).toFixed(1)}px`);
  document.body.appendChild(overlay);

  const alive = new Set<Animation>();
  const reactives = document.querySelectorAll<HTMLElement>(REACT_SELECTOR);
  const targets: Array<{ el: HTMLElement; distance: number }> = [];
  for (const node of reactives) {
    if (targets.length >= MAX_REACT * 2) break;
    if (!node.isConnected || node === overlay) continue;
    const c = centreOf(node);
    if (!c) continue;
    if (c.rect.bottom < 0 || c.rect.right < 0 || c.rect.top > innerHeight || c.rect.left > innerWidth) continue;
    const distance = Math.hypot(c.x - at.x, c.y - at.y);
    targets.push({ el: node, distance });
  }
  targets.sort((a, b) => a.distance - b.distance);
  const chosen = targets.slice(0, MAX_REACT);
  const maxDistance = Math.max(1, ...chosen.map((t) => t.distance));

  for (const { el: node, distance } of chosen) {
    const w = 1 - Math.min(1, distance / maxDistance);
    const scale = 1 + 0.018 + w * 0.05;
    const offset = (0.6 + 0.4 * w) * 2.4;
    const delay = BASE_DELAY_MS + Math.min(MAX_DELAY_MS, (distance / maxDistance) * MAX_DELAY_MS);
    const anim = node.animate(
      [
        { transform: 'translate3d(0, 0, 0) scale(1)', offset: 0 },
        { transform: `translate3d(0, ${-offset.toFixed(2)}px, 0) scale(${scale.toFixed(4)})`, offset: 0.38 },
        { transform: `translate3d(0, ${(offset * 0.5).toFixed(2)}px, 0) scale(${(1 - w * 0.01).toFixed(4)})`, offset: 0.62 },
        { transform: 'translate3d(0, 0, 0) scale(1)', offset: 1 },
      ],
      {
        duration: REACT_MS + w * 120,
        delay,
        easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
        fill: 'none',
      },
    );
    alive.add(anim);
    void anim.finished.finally(() => alive.delete(anim));
  }

  const timer = window.setTimeout(() => {
    overlay.remove();
    if (current?.cancel === cancel) current = null;
  }, RIPPLE_MS + MAX_DELAY_MS + 80);

  const cancel = () => {
    clearTimeout(timer);
    overlay.remove();
    for (const a of alive) a.cancel();
    alive.clear();
  };
  current = { cancel };
  return true;
}
