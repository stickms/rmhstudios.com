/**
 * BROWSER ONLY — the one file in `assets/` that touches the DOM. A real `TextureCache`
 * (WorldRenderer's `textures` option) whose files are generated on demand: the first
 * `acquire('tex/<id>.webp')` builds the pixels with `buildTexture`, encodes them to a WebP
 * (PNG where the browser cannot encode WebP) blob and hands the cache a blob: URL to fetch.
 * Never import this from the pure modules or from Node tests.
 */
import { TextureCache, type TextureCacheOptions } from '../../tf2-game/render/texture-cache';
import type { Texture } from 'three';
import { TEXTURE_SIZE, textureRecipes } from './materials';
import { buildTexture, type MaterialRecipe } from './textures';

export type ProceduralTextureCacheOptions = Omit<TextureCacheOptions, 'url'> & {
  /** Recipes by texture id; defaults to every material in the table. */
  recipes?: Map<string, MaterialRecipe>;
  size?: number;
};

const FILE_RE = /^tex\/([a-f0-9]{40})\.webp$/;

async function encode(data: Uint8ClampedArray, w: number, h: number): Promise<Blob> {
  const img = new ImageData(new Uint8ClampedArray(data), w, h);
  if (typeof OffscreenCanvas !== 'undefined') {
    const c = new OffscreenCanvas(w, h);
    c.getContext('2d')!.putImageData(img, 0, 0);
    return c.convertToBlob({ type: 'image/webp', quality: 1 });
  }
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  c.getContext('2d')!.putImageData(img, 0, 0);
  return new Promise<Blob>((resolve, reject) =>
    c.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/webp', 1),
  );
}

class ProceduralTextureCache extends TextureCache {
  private readonly urls: Map<string, string>;
  private readonly building = new Map<string, Promise<string | null>>();
  private readonly inFlight = new Map<string, number>();
  private readonly cancelled = new Map<string, number>();
  private readonly recipes: Map<string, MaterialRecipe>;
  private readonly size: number;

  constructor(opts: ProceduralTextureCacheOptions, urls: Map<string, string>) {
    super({ ...opts, url: (file) => urls.get(file) ?? '' });
    this.urls = urls;
    this.recipes = opts.recipes ?? textureRecipes();
    this.size = opts.size ?? TEXTURE_SIZE;
  }

  private ensure(file: string): Promise<string | null> {
    let p = this.building.get(file);
    if (!p) {
      const id = FILE_RE.exec(file)?.[1];
      const recipe = id ? this.recipes.get(id) : undefined;
      p = recipe
        ? (async () => {
            const t = buildTexture(recipe, this.size);
            const blob = await encode(t.data, t.w, t.h);
            const url = URL.createObjectURL(blob);
            this.urls.set(file, url);
            return url;
          })().catch(() => null)
        : Promise.resolve(null);
      this.building.set(file, p);
    }
    return p;
  }

  override acquire(file: string): Promise<Texture | null> {
    if (this.urls.has(file)) return super.acquire(file);
    this.inFlight.set(file, (this.inFlight.get(file) ?? 0) + 1);
    return this.ensure(file).then((url) => {
      this.inFlight.set(file, (this.inFlight.get(file) ?? 1) - 1);
      const c = this.cancelled.get(file) ?? 0;
      if (c > 0) {
        this.cancelled.set(file, c - 1);
        return null;
      }
      return url ? super.acquire(file) : null;
    });
  }

  override release(file: string): void {
    const pending = this.inFlight.get(file) ?? 0;
    const cancelled = this.cancelled.get(file) ?? 0;
    if (pending > cancelled) this.cancelled.set(file, cancelled + 1);
    else super.release(file);
  }

  override dispose(): void {
    super.dispose();
    for (const url of this.urls.values()) URL.revokeObjectURL(url);
    this.urls.clear();
    this.building.clear();
    this.inFlight.clear();
    this.cancelled.clear();
  }
}

/** A `TextureCache` that serves the procedural textures; pass it as WorldRenderer's `textures`. */
export function createProceduralTextureCache(
  opts: ProceduralTextureCacheOptions = {},
): TextureCache {
  return new ProceduralTextureCache(opts, new Map());
}
