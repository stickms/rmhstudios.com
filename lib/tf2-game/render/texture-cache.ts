/**
 * Map and model textures by content-addressed file (`tex/<sha>.webp`), shared by every
 * map and model that uses them (reference counted), uploaded as sRGB with GPU mipmaps
 * and anisotropic filtering. `maxSize` downscales on decode (createImageBitmap resize)
 * for low-memory devices.
 *
 * Texture coordinates in this renderer keep Source's orientation (v down), so textures
 * load with flipY = false, the same as glTF.
 */
import {
  LinearFilter,
  LinearMipmapLinearFilter,
  RepeatWrapping,
  SRGBColorSpace,
  Texture,
  type WebGLRenderer,
} from 'three';

export interface TextureCacheOptions {
  /** URL of a texture file (a manifest `file`, e.g. `tex/<sha>.webp`). */
  url: (file: string) => string;
  /** Max anisotropy (default: the renderer's maximum, capped at 8). */
  anisotropy?: number;
  /** Downscale so neither side exceeds this many pixels (mobile quality). */
  maxSize?: number;
  /** Max concurrent downloads (default 8). */
  concurrency?: number;
  renderer?: WebGLRenderer;
}

interface Entry {
  refs: number;
  promise: Promise<Texture | null>;
  texture: Texture | null;
  bitmap: ImageBitmap | null;
  aborted: boolean;
}

export class TextureCache {
  private readonly entries = new Map<string, Entry>();
  private readonly queue: Array<() => void> = [];
  private active = 0;
  private inflight = 0;
  private idleWaiters: Array<() => void> = [];
  private readonly opts: TextureCacheOptions;
  private anisotropy: number;
  /** Bytes uploaded (approximate, incl. mips) for stats. */
  bytes = 0;

  constructor(opts: TextureCacheOptions) {
    this.opts = opts;
    const max = opts.renderer?.capabilities.getMaxAnisotropy() ?? 1;
    this.anisotropy = Math.max(1, Math.min(opts.anisotropy ?? 8, max || 1));
  }

  /** Number of textures still downloading or decoding. */
  get pending(): number {
    return this.inflight;
  }

  /** Resolves once nothing is downloading. */
  whenIdle(): Promise<void> {
    if (this.inflight === 0) return Promise.resolve();
    return new Promise((r) => this.idleWaiters.push(r));
  }

  /** Takes a reference to a texture (loading it on first use). Resolves null on failure. */
  acquire(file: string): Promise<Texture | null> {
    let e = this.entries.get(file);
    if (e) {
      e.refs++;
      return e.promise;
    }
    const entry: Entry = { refs: 1, promise: Promise.resolve(null), texture: null, bitmap: null, aborted: false };
    this.inflight++;
    entry.promise = new Promise<void>((r) => this.schedule(r))
      .then(() => this.load(file, entry))
      .catch(() => null)
      .finally(() => {
        this.active--;
        this.pump();
        if (--this.inflight === 0) {
          const w = this.idleWaiters;
          this.idleWaiters = [];
          for (const f of w) f();
        }
      });
    e = entry;
    this.entries.set(file, e);
    return e.promise;
  }

  /** Drops a reference; the GPU texture is freed when the last one goes. */
  release(file: string): void {
    const e = this.entries.get(file);
    if (!e || --e.refs > 0) return;
    this.entries.delete(file);
    e.aborted = true;
    this.free(e);
  }

  dispose(): void {
    for (const e of this.entries.values()) {
      e.aborted = true;
      this.free(e);
    }
    this.entries.clear();
  }

  private free(e: Entry): void {
    if (e.texture) {
      this.bytes -= texBytes(e.texture);
      e.texture.dispose();
      e.texture = null;
    }
    e.bitmap?.close();
    e.bitmap = null;
  }

  private schedule(start: () => void): void {
    this.queue.push(start);
    this.pump();
  }

  private pump(): void {
    const limit = this.opts.concurrency ?? 8;
    while (this.active < limit && this.queue.length) {
      this.active++;
      this.queue.shift()!();
    }
  }

  private async load(file: string, entry: Entry): Promise<Texture | null> {
    if (entry.aborted) return null;
    const res = await fetch(this.opts.url(file));
    if (!res.ok) return null;
    const blob = await res.blob();
    if (entry.aborted) return null;
    let bitmap = await createImageBitmap(blob, {
      premultiplyAlpha: 'none',
      colorSpaceConversion: 'none',
    });
    const max = this.opts.maxSize;
    if (max && (bitmap.width > max || bitmap.height > max)) {
      const k = max / Math.max(bitmap.width, bitmap.height);
      const small = await createImageBitmap(bitmap, {
        resizeWidth: Math.max(1, Math.round(bitmap.width * k)),
        resizeHeight: Math.max(1, Math.round(bitmap.height * k)),
        resizeQuality: 'high',
        premultiplyAlpha: 'none',
        colorSpaceConversion: 'none',
      });
      bitmap.close();
      bitmap = small;
    }
    if (entry.aborted) {
      bitmap.close();
      return null;
    }
    const tex = new Texture(bitmap);
    tex.flipY = false;
    tex.colorSpace = SRGBColorSpace;
    tex.wrapS = RepeatWrapping;
    tex.wrapT = RepeatWrapping;
    tex.magFilter = LinearFilter;
    tex.minFilter = LinearMipmapLinearFilter;
    tex.generateMipmaps = true;
    tex.anisotropy = this.anisotropy;
    tex.needsUpdate = true;
    entry.texture = tex;
    entry.bitmap = bitmap;
    this.bytes += texBytes(tex);
    return tex;
  }
}

function texBytes(t: Texture): number {
  const img = t.image as { width?: number; height?: number } | null;
  return img && img.width && img.height ? Math.round(img.width * img.height * 4 * 1.33) : 0;
}
