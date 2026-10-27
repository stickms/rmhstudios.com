/**
 * Runs the war paint compositor off the main thread: fetches a kit's script and the textures it reads,
 * composites the chosen wear level for the seed, and hands back 8-bit RGBA. Textures are kept between
 * requests, so dragging the seed slider only pays for the composite.
 */

import {
  compose,
  fromRgba,
  kitTextureUrl,
  kitUrl,
  texturesOf,
  toRgba,
  type KitScript,
  type Raster,
} from './warpaint';

export interface PaintRequest {
  id: number;
  script: string;
  wear: number;
  seed: number;
  size: number;
}

export type PaintResponse =
  | { id: number; ok: true; w: number; h: number; rgba: Uint8ClampedArray }
  | { id: number; ok: false };

const scripts = new Map<string, Promise<KitScript | null>>();
const rasters = new Map<string, Promise<Raster | null>>();
const MAX_CACHED = 80;

function remember<T>(
  cache: Map<string, Promise<T>>,
  key: string,
  make: () => Promise<T>,
): Promise<T> {
  let hit = cache.get(key);
  if (!hit) {
    hit = make();
    cache.set(key, hit);
    // A failed load must not be remembered forever (the sync may publish it later).
    void hit.then((v) => v === null && cache.delete(key));
    if (cache.size > MAX_CACHED) cache.delete(cache.keys().next().value as string);
  }
  return hit;
}

const loadScript = (name: string) =>
  remember(scripts, name, async () => {
    const res = await fetch(kitUrl(name)).catch(() => null);
    return res?.ok ? ((await res.json()) as KitScript) : null;
  });

const loadRaster = (path: string) =>
  remember(rasters, path, async () => {
    const res = await fetch(kitTextureUrl(path)).catch(() => null);
    if (!res?.ok) return null;
    // `none`: the group maps hold ids, which a colour conversion would change.
    const bitmap = await createImageBitmap(await res.blob(), { colorSpaceConversion: 'none' });
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();
    const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return fromRgba(data, width, height);
  });

async function paint(req: PaintRequest): Promise<PaintResponse> {
  const script = await loadScript(req.script);
  const tree = script?.w[Math.min(5, Math.max(1, req.wear)) - 1];
  if (!tree) return { id: req.id, ok: false };
  const paths = [...texturesOf(tree)];
  const loaded = await Promise.all(paths.map(loadRaster));
  const byPath = new Map(paths.map((p, i) => [p, loaded[i]] as const));
  const out = compose(tree, {
    size: req.size,
    seed: req.seed,
    wear: req.wear,
    texture: (p) => byPath.get(p) ?? undefined,
  });
  return { id: req.id, ok: true, w: out.w, h: out.h, rgba: toRgba(out) };
}

self.onmessage = (e: MessageEvent<PaintRequest>) => {
  paint(e.data).then(
    (res) =>
      (self as unknown as Worker).postMessage(res, res.ok ? [res.rgba.buffer as ArrayBuffer] : []),
    () =>
      (self as unknown as Worker).postMessage({ id: e.data.id, ok: false } satisfies PaintResponse),
  );
};
