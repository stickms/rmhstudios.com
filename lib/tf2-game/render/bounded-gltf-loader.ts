/**
 * The glTF loader of a match: a few models at a time, their textures shared and, on a phone, shrunk.
 *
 * A match loads every model it may show with the map: the map's static props, the player models and
 * every weapon's view and world model, about 1,350 GLBs on de_dust2. The loader used to start all of
 * them at once, so at the peak every GLB's bytes, its parsed JSON and its decoded texture images were
 * in memory together (measured in a phone profile on 2026-11-13: about 1,360 requests in flight and a
 * 1 GB heap). iPhone Safari ends a tab that large and reloads the page, which put the player back on
 * the main menu during loading, every time. Desktop Chromium answered the same burst with
 * ERR_INSUFFICIENT_RESOURCES for some files, so those models never appeared.
 *
 * `boundedGltfLoader` is the queue: `concurrency` models are in flight, and a slot is held until the
 * model is parsed, which includes its textures. The textures come from `SharedModelTextures`
 * (./model-textures.ts): one decode and one GPU texture per texture file however many models name it,
 * no larger than the quality plan's cap on the phone tier (model textures do not go through
 * `TextureCache`, so that cap would not otherwise apply to them).
 */

import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { Tf2GLTFLoader } from '@/lib/tf2-loadout/gltf-loader';
import type { QualityPlan } from '../client/quality';
import { SharedModelTextures } from './model-textures';

/** Models loading at once: a phone holds few decodes in memory; elsewhere the limit only keeps the burst off the network stack. */
export const MODEL_LOADS = { phone: 6, other: 24 } as const;

export interface BoundedGltfLoaderOptions {
  /** Models loading at once. */
  concurrency: number;
}

interface Loader {
  loadAsync(url: string): Promise<GLTF>;
}

export function boundedGltfLoader(inner: Loader, opts: BoundedGltfLoaderOptions): Loader {
  const limit = Math.max(1, Math.floor(opts.concurrency));
  const waiting: Array<() => void> = [];
  let active = 0;
  const release = () => {
    active--;
    const next = waiting.shift();
    if (next) {
      active++;
      next();
    }
  };
  const slot = (): Promise<void> => {
    if (active < limit) {
      active++;
      return Promise.resolve();
    }
    return new Promise((resolve) => waiting.push(resolve));
  };
  return {
    async loadAsync(url: string): Promise<GLTF> {
      await slot();
      try {
        return await inner.loadAsync(url);
      } finally {
        release();
      }
    },
  };
}

/** The model loader a client uses for a match: the queue, shared textures, and the plan's texture cap on the phone tier. */
export function modelLoaderFor(plan: Pick<QualityPlan, 'tier' | 'maxTextureSize'>): Loader {
  const phone = plan.tier === 'mobile';
  const textures = new SharedModelTextures(phone ? { maxSize: plan.maxTextureSize } : {});
  return boundedGltfLoader(new Tf2GLTFLoader(undefined, textures), { concurrency: phone ? MODEL_LOADS.phone : MODEL_LOADS.other });
}
