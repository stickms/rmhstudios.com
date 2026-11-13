/**
 * A glTF loader that loads a few models at a time, and on a phone shrinks their textures.
 *
 * A match loads every model it may show with the map: the map's static props, the player models and
 * every weapon's view and world model, about 1,350 GLBs on de_dust2. The loader used to start all of
 * them at once, so at the peak every GLB's bytes, its parsed JSON and its decoded texture images were
 * in memory together (measured in a phone profile on 2026-11-13: about 1,360 requests in flight and a
 * 1 GB heap). iPhone Safari ends a tab that large and reloads the page, which put the player back on
 * the main menu during loading, every time. Desktop Chromium answered the same burst with
 * ERR_INSUFFICIENT_RESOURCES for some files, so those models never appeared.
 *
 * This wrapper is the queue. `concurrency` models are in flight; a slot is held until the model is
 * parsed and, where `maxTextureSize` is set, until its textures have been replaced by copies no larger
 * than that (the full-size decodes are then unreferenced). Model textures did not go through
 * `TextureCache`, so the phone tier's texture cap never applied to them.
 */

import type { Texture } from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { Tf2GLTFLoader } from '@/lib/tf2-loadout/gltf-loader';
import type { QualityPlan } from '../client/quality';

/** Models loading at once: a phone holds few decodes in memory; elsewhere the limit only keeps the burst off the network stack. */
export const MODEL_LOADS = { phone: 6, other: 24 } as const;

export interface BoundedGltfLoaderOptions {
  /** Models loading at once. */
  concurrency: number;
  /** Shrink model textures so neither side exceeds this many pixels (the quality plan's cap). Omit to keep them. */
  maxTextureSize?: number;
}

interface Loader {
  loadAsync(url: string): Promise<GLTF>;
}

type Sized = { width: number; height: number };

/** The size a `width` x `height` image is drawn at so neither side exceeds `max`. Pure. */
export function fitWithin(width: number, height: number, max: number): Sized {
  if (width <= max && height <= max) return { width, height };
  const k = max / Math.max(width, height);
  return { width: Math.max(1, Math.round(width * k)), height: Math.max(1, Math.round(height * k)) };
}

async function shrink(image: unknown, max: number): Promise<unknown> {
  const src = image as (Sized & { naturalWidth?: number; naturalHeight?: number }) | null;
  const width = src?.naturalWidth || src?.width || 0;
  const height = src?.naturalHeight || src?.height || 0;
  if (!src || !width || !height) return image;
  const to = fitWithin(width, height, max);
  if (to.width === width && to.height === height) return image;
  if (typeof createImageBitmap !== 'function') return image;
  try {
    // glTF textures are not flipped and not premultiplied; an ImageBitmap carries both decisions itself.
    return await createImageBitmap(src as ImageBitmapSource, {
      resizeWidth: to.width,
      resizeHeight: to.height,
      resizeQuality: 'high',
      premultiplyAlpha: 'none',
      colorSpaceConversion: 'none',
    });
  } catch {
    return image;
  }
}

async function shrinkTextures(gltf: GLTF, max: number): Promise<void> {
  let textures: Texture[];
  try {
    textures = (await gltf.parser.getDependencies('texture')) as Texture[];
  } catch {
    return;
  }
  // Textures can share one image: shrink each image once.
  const done = new Map<unknown, unknown>();
  for (const tex of textures) {
    const image: unknown = tex?.image;
    if (!image) continue;
    let small = done.get(image);
    if (small === undefined) {
      small = await shrink(image, max);
      done.set(image, small);
    }
    if (small !== image) {
      tex.image = small;
      tex.needsUpdate = true;
    }
  }
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
        const gltf = await inner.loadAsync(url);
        if (opts.maxTextureSize) await shrinkTextures(gltf, opts.maxTextureSize);
        return gltf;
      } finally {
        release();
      }
    },
  };
}

/** The model loader a client uses for a match: the queue, and the plan's texture cap on the phone tier. */
export function modelLoaderFor(plan: Pick<QualityPlan, 'tier' | 'maxTextureSize'>): Loader {
  const inner = new Tf2GLTFLoader();
  return plan.tier === 'mobile'
    ? boundedGltfLoader(inner, { concurrency: MODEL_LOADS.phone, maxTextureSize: plan.maxTextureSize })
    : boundedGltfLoader(inner, { concurrency: MODEL_LOADS.other });
}
