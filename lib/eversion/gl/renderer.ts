/**
 * The WebGL2 renderer (spec §3.1, §8.4–8.5, §10.1). OWNER: T24 (T23 wires the
 * real shaders' uniforms). Client-only, no React.
 *
 * ## What it is, and what it deliberately is not
 *
 * A thin object around one `WebGL2RenderingContext` that works identically on an
 * `OffscreenCanvas` (inside the worker) and on a DOM canvas (the in-thread
 * fallback). It owns programs, the tier's mesh buffers, the two page textures
 * plus the placeholder, and the LUT — and nothing else. It has **no loop and no
 * clock**: the host calls {@link RendererApi.draw} once per frame with the
 * timeline's snapshot. That separation is what lets the same renderer run under
 * a worker's frame loop or the main thread's, and what lets the harness scrub
 * to any point by calling `draw` with a hand-built snapshot.
 *
 * ## Per-frame rules (spec §8.4)
 *
 * `draw` allocates nothing, writes about eight uniforms (`UNIFORMS` with
 * cadence `frame`) and makes at most two draw calls — the surface, then the cage
 * lines. Depth testing is on, with no sorting and no transparency until POP.
 * `FRONT_FACE = CCW`, culling off, so `gl_FrontFacing` selects the page side.
 *
 * ## Context and output
 *
 * Created with `alpha: true, premultipliedAlpha: true, antialias: true,
 * depth: true`. Cleared to the resolved veil colour with alpha
 * `snapshot.bgAlpha` — opaque from the first frame, transparent from `reveal`
 * on (spec §10.1). Context loss is surfaced through
 * {@link RendererOptions.onContextLost}.
 *
 * ## Lifetime (spec §3.2, §8.5)
 *
 * `release()` at the end of each navigation frees the page textures, the
 * placeholder and the LUT (the caller closes its `ImageBitmap`s); programs and
 * the mesh stay so the next navigation does not recompile. `dispose()` frees
 * everything. A 20-navigation soak must return `counters().live` to its
 * post-prime baseline after every `done`.
 *
 * ## Shaders
 *
 * It compiles the stub `ShaderSet` (`stub-shaders.ts`, T24) until T23's
 * `getShaderSet()` is available, then the real one; nothing outside this file
 * chooses.
 */

/* eslint-disable @typescript-eslint/no-unused-vars -- contract stub: T24 replaces every body, and this line with them */
import { notImplemented } from '../not-implemented';
import type { RendererApi, RendererOptions } from '../types';

/**
 * Create a renderer on `canvas`. Works on an `OffscreenCanvas` or a DOM canvas.
 * Compiles the programs and builds the tier's mesh buffers; does not draw.
 * Registers the `renderer` debug slot.
 *
 * @throws if WebGL2 is unavailable or program compilation fails — the host
 *   turns that into a `fatal` `error` message and the controller falls back.
 */
export function createRenderer(
  canvas: OffscreenCanvas | HTMLCanvasElement,
  options: RendererOptions,
): RendererApi {
  return notImplemented('createRenderer', 'T24');
}
