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
 * This file imports nothing heavy on purpose: `EversionOverlay` is the one
 * piece the hub may render without the controller chunk, and it needs only this.
 */

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
    return;
  }
  const c = getCanvas();
  if (c.parentElement !== el) el.appendChild(c);
  attached = true;
  waiting?.resolve();
  waiting = null;
}
