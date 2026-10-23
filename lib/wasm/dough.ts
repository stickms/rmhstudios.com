import url from './generated/dough.wasm?url&no-inline';
import { wasmModule } from './load';

export interface DoughKernel {
  memory: WebAssembly.Memory;
  pointer(): number;
  substep(
    dt: number,
    held: number,
    gx: number,
    gy: number,
    vx: number,
    vy: number,
    pinch: number,
  ): number;
  derive(): void;
}

const compile = wasmModule(url);

/** Separate fixed memory per body; no allocation, copying, or growth per frame. */
export async function createDoughKernel(): Promise<DoughKernel | null> {
  try {
    const module = await compile();
    if (!module) return null;
    return new WebAssembly.Instance(module).exports as unknown as DoughKernel;
  } catch {
    return null;
  }
}
