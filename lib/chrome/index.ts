/**
 * Chrome reflections (Steel 4.3). Loaded at idle after hydration (V4); components never
 * import this. An element opts in with `data-chrome="ball"` or `data-chrome="pill"` and
 * must be able to hold a child (the renderer appends one small canvas to it).
 *
 * The page is complete without this module: the CSS gradients in app/styles/steel-chrome.css
 * are the first paint and the fallback (V11).
 */
import { ChromeRenderer, type BallState, type Host } from './renderer';

let renderer: ChromeRenderer | null = null;

/**
 * Has React finished hydrating this element? React stamps a node with a `__reactFiber$…` key as it hydrates it, in
 * document order, and completes an element in the same step as the last node inside it. So the element is done once the
 * last node of its subtree carries the key. (Comments are skipped: React keeps no fiber on a Suspense marker.)
 */
export function hydrated(el: Element): boolean {
  let node: Node = el;
  for (;;) {
    let last = node.lastChild;
    while (last && last.nodeType === 8) last = last.previousSibling;
    if (!last) break;
    node = last;
  }
  return Object.keys(node).some((key) => key.startsWith('__reactFiber$'));
}

function browserHost(): Host {
  return {
    window,
    document,
    requestFrame: (fn) => window.requestAnimationFrame(fn),
    cancelFrame: (id) => window.cancelAnimationFrame(id),
    requestIdle: (fn) => {
      const idle = (window as { requestIdleCallback?: Window['requestIdleCallback'] })
        .requestIdleCallback;
      if (idle) idle.call(window, fn, { timeout: 500 });
      else setTimeout(fn, 60);
    },
    createGlCanvas: () => document.createElement('canvas'),
    createEnvCanvas: () => document.createElement('canvas'),
    ready: hydrated,
  };
}

/** Start the one renderer. Safe to call more than once; false when WebGL is unavailable. */
export function startChrome(): boolean {
  if (typeof window === 'undefined') return false;
  renderer ??= new ChromeRenderer(browserHost());
  return renderer.start();
}

/** V8: tell the renderer the page's content changed (route change, a feed page appended). */
export function refreshChrome(): void {
  renderer?.invalidate();
}

/** V9: a transition of `ms` is running on a chrome element (the globe opening or closing). */
export function animateChrome(ms: number): void {
  renderer?.animate(ms);
}

/**
 * Make a chrome ball a body (lib/globe). null: the renderer has not started yet (ask again); false: this machine
 * cannot draw one (no WebGL or no float textures), so the ball stays flat chrome.
 */
export function attachChromeBall(el: Element, state: BallState, fragment: string): boolean | null {
  return renderer ? renderer.attachBall(el, state, fragment) : null;
}

export function detachChromeBall(el: Element): void {
  renderer?.detachBall(el);
}

/** A body's state changed: draw one frame. */
export function drawChrome(): void {
  renderer?.schedule();
}

/** V13 measurements of the running renderer, or null before it starts. */
export function chromeTimings(): {
  draw: number;
  environment: number;
  longestSlice: number;
} | null {
  return renderer ? renderer.timings : null;
}

export function stopChrome(): void {
  renderer?.stop();
  renderer = null;
}

export { ChromeRenderer } from './renderer';
export type { BallState } from './renderer';
