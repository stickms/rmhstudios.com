import { describe, expect, it, vi } from 'vitest';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';

vi.mock('@/lib/tf2-loadout/gltf-loader', () => ({ Tf2GLTFLoader: class {} }));

import { boundedGltfLoader, MODEL_LOADS } from './bounded-gltf-loader';

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

  it('loads few models at once on a phone', () => {
    expect(MODEL_LOADS.phone).toBeLessThanOrEqual(8);
  });
});
