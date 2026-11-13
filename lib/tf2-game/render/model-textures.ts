/**
 * The textures of a match's models, one per texture file.
 *
 * A published GLB names its textures by content address (`../tex/<sha>.webp`), and many models name the
 * same file: de_dust2's 1,270 models ask for 1,595 textures that are 237 files (one crate sheet is on 91
 * models), 2fort's 380 ask for 874 that are 569. GLTFLoader gives every parse a texture loader of its
 * own, so each model decoded its own copy of the picture and, once drawn, uploaded its own copy to the
 * GPU. Measured in a phone profile on 2026-11-13, with every model drawn that came to 1,575 MB of GPU
 * texture for CS:GO where the files are 221 MB (TF2: 875 MB for 550 MB), and it is reached during play,
 * as the player sees more of the map. iPhone Safari ends a tab that large and reloads the page.
 *
 * This is the one texture loader every parse of a match shares (`Tf2GLTFLoader`'s second argument). A
 * file is fetched and decoded once into one three.js `Source`; each model gets a `Texture` of its own
 * on that source, and three.js keeps one GPU texture per source for textures that sample it the same
 * way. On the phone tier (`maxSize`) the picture is shrunk before any texture exists, so the full-size
 * decode is never held. An image embedded in a GLB (a `blob:` or `data:` URL) belongs to that file alone.
 */

import { ImageLoader, Source, Texture } from 'three';

export interface ModelTexturesOptions {
  /** Shrink a picture so neither side exceeds this many pixels (the quality plan's cap). Omit to keep it. */
  maxSize?: number;
}

type Sized = { width: number; height: number };

interface ImageSource {
  loadAsync(url: string): Promise<unknown>;
}

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

const OWN_URL = /^(blob|data):/i;

export class SharedModelTextures {
  private readonly sources = new Map<string, Promise<Source<unknown>>>();

  constructor(
    private readonly opts: ModelTexturesOptions = {},
    private readonly images: ImageSource = new ImageLoader(),
  ) {}

  /** Texture files held (each decoded once). */
  get size(): number {
    return this.sources.size;
  }

  /** `TextureLoader.load`'s contract, which is what a glTF parser calls. */
  load(url: string, onLoad: (texture: Texture) => void, _onProgress?: unknown, onError?: (error: unknown) => void): void {
    this.source(url).then(
      (source) => {
        const texture = new Texture();
        texture.source = source;
        texture.needsUpdate = true;
        onLoad(texture);
      },
      (error: unknown) => onError?.(error),
    );
  }

  private source(url: string): Promise<Source<unknown>> {
    const shared = !OWN_URL.test(url);
    const held = shared ? this.sources.get(url) : undefined;
    if (held) return held;
    const max = this.opts.maxSize;
    const made = this.images
      .loadAsync(url)
      .then((image) => (max ? shrink(image, max) : image))
      .then((image) => new Source(image));
    if (shared) {
      this.sources.set(url, made);
      // A file that failed is asked for again by the next model that names it.
      made.catch(() => this.sources.delete(url));
    }
    return made;
  }
}
