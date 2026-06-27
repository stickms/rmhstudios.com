/**
 * Canvas surface abstraction for Dream Rift.
 *
 * All procedural art (bullets, sprites, backgrounds) is drawn onto offscreen
 * surfaces so it can be cached and blitted with `drawImage`. The same drawing
 * code runs in two environments:
 *   - the browser (real `<canvas>` / `OffscreenCanvas`) during play
 *   - Node via `@napi-rs/canvas` for generating preview screenshots
 *
 * A pluggable factory keeps the art code environment-agnostic: the Node
 * screenshot harness installs a factory before generating, the browser falls
 * back to the DOM automatically.
 */

export interface Surface {
    /** Drawable canvas — valid as a `drawImage` source in its own environment. */
    canvas: CanvasImageSource & { width: number; height: number };
    ctx: CanvasRenderingContext2D;
    width: number;
    height: number;
}

type Factory = (w: number, h: number) => { canvas: unknown; ctx: unknown };

let factory: Factory | null = null;

/** Install a custom canvas factory (used by the Node screenshot harness). */
export function setCanvasFactory(f: Factory | null): void {
    factory = f;
}

/** Create an offscreen drawing surface of the given pixel dimensions. */
export function createSurface(width: number, height: number): Surface {
    const w = Math.max(1, Math.ceil(width));
    const h = Math.max(1, Math.ceil(height));

    if (factory) {
        const { canvas, ctx } = factory(w, h);
        return { canvas: canvas as Surface['canvas'], ctx: ctx as CanvasRenderingContext2D, width: w, height: h };
    }

    if (typeof OffscreenCanvas !== 'undefined') {
        const canvas = new OffscreenCanvas(w, h);
        const ctx = canvas.getContext('2d') as unknown as CanvasRenderingContext2D;
        return { canvas: canvas as unknown as Surface['canvas'], ctx, width: w, height: h };
    }

    if (typeof document !== 'undefined') {
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d')!;
        return { canvas, ctx, width: w, height: h };
    }

    throw new Error('No canvas implementation available — call setCanvasFactory() first.');
}
