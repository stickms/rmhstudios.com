import { describe, expect, it, vi } from 'vitest';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';

vi.mock('@/lib/tf2-loadout/gltf-loader', () => ({ Tf2GLTFLoader: class {} }));

import { boundedGltfLoader, fitWithin, MODEL_LOADS } from './bounded-gltf-loader';

const gltfWith = (textures: unknown[]) => ({ parser: { getDependencies: async () => textures } }) as unknown as GLTF;

describe('boundedGltfLoader', () => {
  it('never has more than `concurrency` models in flight, and starts every one', async () => {
    let inFlight = 0;
    let peak = 0;
    const gates: Array<() => void> = [];
    const inner = {
      loadAsync: (_url: string) =>
        new Promise<GLTF>((resolve) => {
          peak = Math.max(peak, ++inFlight);
          gates.push(() => {
            inFlight--;
            resolve(gltfWith([]));
          });
        }),
    };
    const loader = boundedGltfLoader(inner, { concurrency: 6 });
    const all = Promise.all(Array.from({ length: 200 }, (_, i) => loader.loadAsync(`m${i}.glb`)));
    for (let done = 0; done < 200; ) {
      await new Promise((r) => setTimeout(r, 0));
      expect(inFlight).toBeLessThanOrEqual(6);
      while (gates.length) {
        gates.shift()!();
        done++;
      }
    }
    expect((await all).length).toBe(200);
    expect(peak).toBe(6);
  });

  it('frees the slot of a model that fails, so one bad file does not stall the map', async () => {
    const inner = { loadAsync: async (url: string) => (url === 'bad' ? Promise.reject(new Error('404')) : gltfWith([])) };
    const loader = boundedGltfLoader(inner, { concurrency: 1 });
    await expect(loader.loadAsync('bad')).rejects.toThrow('404');
    await expect(loader.loadAsync('good')).resolves.toBeTruthy();
  });

  it('replaces a texture larger than the cap with a copy that fits, once per shared image', async () => {
    const big = { naturalWidth: 2048, naturalHeight: 1024, width: 2048, height: 1024 };
    const small = { naturalWidth: 256, naturalHeight: 256, width: 256, height: 256 };
    const a = { image: big as unknown, needsUpdate: false };
    const b = { image: big as unknown, needsUpdate: false };
    const c = { image: small as unknown, needsUpdate: false };
    const made: Array<{ w: number; h: number }> = [];
    vi.stubGlobal('createImageBitmap', async (_src: unknown, o: { resizeWidth: number; resizeHeight: number; premultiplyAlpha: string }) => {
      expect(o.premultiplyAlpha).toBe('none');
      made.push({ w: o.resizeWidth, h: o.resizeHeight });
      return { width: o.resizeWidth, height: o.resizeHeight, bitmap: true };
    });
    try {
      const loader = boundedGltfLoader({ loadAsync: async () => gltfWith([a, b, c]) }, { concurrency: 2, maxTextureSize: 512 });
      await loader.loadAsync('x.glb');
    } finally {
      vi.unstubAllGlobals();
    }
    expect(made).toEqual([{ w: 512, h: 256 }]);
    expect(a.image).toMatchObject({ width: 512, height: 256 });
    expect(b.image).toBe(a.image);
    expect(a.needsUpdate && b.needsUpdate).toBe(true);
    expect(c.image).toBe(small);
    expect(c.needsUpdate).toBe(false);
  });

  it('keeps textures as they are without a cap', async () => {
    const big = { width: 2048, height: 2048 };
    const t = { image: big as unknown, needsUpdate: false };
    await boundedGltfLoader({ loadAsync: async () => gltfWith([t]) }, { concurrency: 2 }).loadAsync('x.glb');
    expect(t.image).toBe(big);
  });

  it('fits within the cap keeping the aspect, and loads few models at once on a phone', () => {
    expect(fitWithin(1024, 512, 512)).toEqual({ width: 512, height: 256 });
    expect(fitWithin(300, 200, 512)).toEqual({ width: 300, height: 200 });
    expect(fitWithin(4096, 1, 512)).toEqual({ width: 512, height: 1 });
    expect(MODEL_LOADS.phone).toBeLessThanOrEqual(8);
  });
});
