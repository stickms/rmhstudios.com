/**
 * The seam between the controller (which decides WHEN the overlay exists) and
 * `EversionOverlay.tsx` (which is the React element that renders it). OWNER: T31.
 *
 * ## Why a store and not props
 *
 * The controller runs outside React: it is built in an effect, called from a
 * pointer-release handler and finished by a worker message. React needs to learn
 * "show the overlay now" without the hub owning a piece of state for it, and the
 * controller needs to learn "the canvas is in the document" before it lets the
 * render side present a frame. A tiny external store does both and works with
 * `useSyncExternalStore`.
 *
 * ## The canvas outlives the overlay
 *
 * A canvas element's control can be transferred to an `OffscreenCanvas` exactly
 * once (`gl/host.ts`), and its WebGL context — with the compiled programs
 * ("programs stay compiled for the next navigation", spec §3.2) — belongs to it.
 * So the element is created here, once, and the overlay merely ADOPTS it into
 * its `div` while a run is on and lets go of it (detached, not destroyed) when
 * the run ends. Only a context loss throws it away ({@link discardCanvas}).
 *
 * ## The frozen picture
 *
 * The run renders and captures the destination BEFORE the animation starts
 * (`runner.ts`), so for that moment the live page underneath changes while the
 * visitor must keep seeing the page they are leaving. {@link holdPicture} draws
 * the BEFORE capture into `.eversion-hold`, blurred like the shell while the hub
 * is open (`eversion.css`), inside a layer of its own (`.eversion-hold-layer`,
 * rendered by `EversionOverlay` next to the overlay). The layer sits just over
 * the page content and under the floating UI (the cookie bar, the mini-player):
 * the capture leaves those out as not the page, and they stay on screen as they
 * were while the destination renders. {@link raisePicture} lifts it over the
 * effect's canvas before the canvas draws, and {@link releasePicture} fades it
 * onto the first frame, which is that same page, sharp.
 *
 * This file imports nothing heavy on purpose: `EversionOverlay` is the one
 * piece the hub may render without the controller chunk, and it needs only this.
 */

import { HOLD_FADE_MS } from '@/lib/eversion/constants';

export interface OverlayState {
  /** The overlay `div` is in the tree. */
  mounted: boolean;
  /** The context-loss fade (`.eversion-overlay--fading`) is running. */
  fading: boolean;
}

type Listener = () => void;

const listeners = new Set<Listener>();
let state: OverlayState = { mounted: false, fading: false };
let canvas: HTMLCanvasElement | null = null;
let hold: HTMLCanvasElement | null = null;
let holdLayer: HTMLElement | null = null;
let holdTimer: ReturnType<typeof setTimeout> | null = null;
let attached = false;
let waiting: { resolve: () => void; reject: (e: Error) => void } | null = null;

function set(next: OverlayState): void {
  state = next;
  for (const l of [...listeners]) l();
}

export const overlayStore = {
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  getSnapshot(): OverlayState {
    return state;
  },
  getServerSnapshot(): OverlayState {
    return { mounted: false, fading: false };
  },
};

/** The page's canvas, created on first use. Styled to fill the overlay; its backing store is the renderer's business. */
export function getCanvas(): HTMLCanvasElement {
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
  }
  return canvas;
}

/** Drop the canvas after a context loss: its control is gone and so is its context. */
export function discardCanvas(): void {
  canvas = null;
}

/** Show the overlay. Resolves once `EversionOverlay` has put it (and the canvas) in the document. */
export function mountOverlay(): Promise<void> {
  getCanvas();
  attached = false;
  set({ mounted: true, fading: false });
  return new Promise<void>((resolve, reject) => {
    if (attached) return resolve();
    waiting = { resolve, reject };
  });
}

export function fadeOverlay(): void {
  if (state.mounted) set({ ...state, fading: true });
}

export function unmountOverlay(): void {
  dropPicture();
  waiting?.reject(new Error('eversion: overlay unmounted before it attached'));
  waiting = null;
  attached = false;
  if (state.mounted || state.fading) set({ mounted: false, fading: false });
}

/** Called by `EversionOverlay`'s ref once its `div` is in the document (and with `null` when it leaves). */
export function overlayAttached(el: HTMLElement | null): void {
  if (!el) {
    attached = false;
    canvas?.remove();
    dropPicture();
    return;
  }
  const c = getCanvas();
  if (c.parentElement !== el) el.insertBefore(c, el.firstChild);
  attached = true;
  waiting?.resolve();
  waiting = null;
}

/** Called by `EversionOverlay`'s second ref with the frozen picture's layer (and with `null` when it leaves). */
export function holdLayerAttached(el: HTMLElement | null): void {
  if (!el) dropPicture();
  holdLayer = el;
}

/**
 * Show `bitmap` as the frozen picture until {@link releasePicture}. It is DRAWN (not kept), so the caller may
 * transfer the bitmap to the render side straight after. Goes into the picture's layer (the React overlay's, or the
 * debug port's DOM one), else over the canvas. A no-op when neither is in the document.
 */
export function holdPicture(bitmap: ImageBitmap): void {
  const parent = holdLayer ?? canvas?.parentElement;
  if (!parent) return;
  dropPicture();
  const el = document.createElement('canvas');
  el.className = 'eversion-hold';
  el.setAttribute('aria-hidden', 'true');
  el.width = bitmap.width;
  el.height = bitmap.height;
  el.getContext('2d')?.drawImage(bitmap, 0, 0);
  parent.appendChild(el);
  hold = el;
}

/** The effect's canvas is about to draw: lift the picture over it (`.eversion-hold-layer--up`). */
export function raisePicture(): void {
  if (hold) layerOf(hold).classList.add(UP);
}

/** The effect's first frame is on screen: fade the picture out over {@link HOLD_FADE_MS}, then drop it. */
export function releasePicture(): void {
  const el = hold;
  if (!el || holdTimer) return;
  layerOf(el).classList.add(UP, OUT);
  holdTimer = setTimeout(dropPicture, HOLD_FADE_MS + 50);
}

/** Remove the frozen picture at once and give its backing store back. */
export function dropPicture(): void {
  if (holdTimer) clearTimeout(holdTimer);
  holdTimer = null;
  holdLayer?.classList.remove(UP, OUT);
  const el = hold;
  hold = null;
  if (!el) return;
  el.classList.remove(UP, OUT);
  el.remove();
  el.width = 0;
  el.height = 0;
}

const UP = 'eversion-hold-layer--up';
const OUT = 'eversion-hold-layer--out';

/** The element the layer classes go on: the layer, or the picture itself when it had to go over the canvas. */
function layerOf(el: HTMLElement): HTMLElement {
  return el.parentElement === holdLayer && holdLayer ? holdLayer : el;
}
