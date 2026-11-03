// =============================================================================
// ALTAIR ENGINE -- Renderer setup for screens that draw without createGameLoop
// =============================================================================
// createGameLoop wires WebGL, the batches and the 2D overlay canvas inline. The
// co-op match screen has no local simulation to loop, only snapshots to draw,
// so it builds the same WebGLRenderer here and calls renderFrame itself.
// =============================================================================

import type { WebGLRenderer } from './renderer';
import { initWebGL } from './webgl/webgl-context';
import { SpriteBatch } from './webgl/webgl-sprite-batch';
import { ShapeBatch } from './webgl/webgl-shapes';
import { setGLContext } from './webgl/webgl-textures';

export interface RendererHandle {
  renderer: WebGLRenderer;
  /** Keep the text overlay the same pixel size as the render canvas. */
  syncOverlay: () => void;
  destroy: () => void;
}

export function createWebGLRenderer(canvas: HTMLCanvasElement): RendererHandle {
  const gl = initWebGL(canvas);
  setGLContext(gl);
  const spriteBatch = new SpriteBatch(gl);
  const shapeBatch = new ShapeBatch(gl);

  const overlay = document.createElement('canvas');
  overlay.width = canvas.width;
  overlay.height = canvas.height;
  overlay.style.position = 'absolute';
  overlay.style.top = '0';
  overlay.style.left = '0';
  overlay.style.width = '100%';
  overlay.style.height = '100%';
  overlay.style.pointerEvents = 'none';
  canvas.parentElement?.appendChild(overlay);
  const overlayCtx = overlay.getContext('2d')!;

  return {
    renderer: { gl, spriteBatch, shapeBatch, overlayCtx },
    syncOverlay() {
      if (overlay.width !== canvas.width || overlay.height !== canvas.height) {
        overlay.width = canvas.width;
        overlay.height = canvas.height;
      }
    },
    destroy() {
      overlay.parentElement?.removeChild(overlay);
    },
  };
}
