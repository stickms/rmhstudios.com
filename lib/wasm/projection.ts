import url from './generated/projection.wasm?url&no-inline';
import { wasmModule } from './load';
import type { FitParams } from '../eversion/types';

export interface ProjectionKernel {
  memory: WebAssembly.Memory;
  pointer(): number;
  bake(w: number, h: number, halfW: number, halfH: number): void;
}

const compile = wasmModule(url);
let kernel: ProjectionKernel | null = null;
let pending: Promise<void> | undefined;

/** Runs in whichever realm owns eversion: render worker or main-thread fallback. */
export function warmProjectionWasm(): Promise<void> {
  pending ??= compile()
    .then((module) => {
      if (module) kernel = new WebAssembly.Instance(module).exports as unknown as ProjectionKernel;
    })
    .catch(() => {
      kernel = null;
    });
  return pending;
}

export function tryBakePeirceLut(fit: FitParams, w = 1024, h = 512): Float32Array | null {
  if (
    !kernel ||
    fit.kind !== 'peirce' ||
    w < 1 ||
    h < 1 ||
    !Number.isInteger(w) ||
    !Number.isInteger(h) ||
    w * h > 1024 * 512
  )
    return null;
  try {
    kernel.bake(w, h, fit.halfW, fit.halfH);
    // Renderer/plan owns the result; a later bake must not overwrite it.
    return new Float32Array(kernel.memory.buffer, kernel.pointer(), w * h * 2).slice();
  } catch {
    kernel = null;
    return null;
  }
}
