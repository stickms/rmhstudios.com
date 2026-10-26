/**
 * Image loading for the preview.
 *
 * The scene refers to textures by extension-less project path
 * (`materials/hud/health_bg`). `ImageStore` resolves each one through a
 * caller-supplied byte lookup, trying the formats a HUD can ship — PNG/JPEG
 * (what the editor itself writes), VTF (what the game ships) and VMT (a text
 * pointer to a VTF) — decodes once, and caches the result. A texture that
 * cannot be found or decoded is remembered as missing, never retried until
 * `invalidate`, and drawn as a labelled placeholder.
 */

import { parseKv } from '../kv/parse';
import { kvValue } from '../kv/query';
import { decodeUtf8 } from '../util/sha1';
import { decodeVtf } from './vtf';

export type BytesLookup = (path: string) => Uint8Array | undefined;

const EXTENSIONS = ['png', 'jpg', 'jpeg', 'vtf'] as const;

async function decodeBytes(path: string, bytes: Uint8Array): Promise<ImageBitmap | null> {
  try {
    if (path.endsWith('.vtf')) {
      const img = decodeVtf(bytes);
      if (!img) return null;
      return await createImageBitmap(
        new ImageData(img.data as Uint8ClampedArray<ArrayBuffer>, img.width, img.height),
      );
    }
    const type = path.endsWith('.png') ? 'image/png' : 'image/jpeg';
    return await createImageBitmap(new Blob([bytes as BlobPart], { type }));
  } catch {
    return null;
  }
}

export class ImageStore {
  private cache = new Map<string, ImageBitmap | null>();
  private pending = new Map<string, Promise<void>>();

  constructor(
    private lookup: BytesLookup,
    private readonly onChange: () => void,
  ) {}

  setLookup(lookup: BytesLookup): void {
    this.lookup = lookup;
  }

  /** `undefined` = still loading, `null` = missing/undecodable. */
  get(path: string): ImageBitmap | null | undefined {
    if (this.cache.has(path)) return this.cache.get(path);
    if (!this.pending.has(path)) {
      const p = this.resolve(path).then((bmp) => {
        this.cache.set(path, bmp);
        this.pending.delete(path);
        this.onChange();
      });
      this.pending.set(path, p);
    }
    return undefined;
  }

  private async resolve(path: string): Promise<ImageBitmap | null> {
    for (const ext of EXTENSIONS) {
      const full = `${path}.${ext}`;
      const bytes = this.lookup(full);
      if (bytes) {
        const bmp = await decodeBytes(full, bytes);
        if (bmp) return bmp;
      }
    }
    // A VMT names its texture: "$basetexture" "hud/foo" → materials/hud/foo.vtf
    const vmt = this.lookup(`${path}.vmt`);
    if (vmt) {
      const doc = parseKv(decodeUtf8(vmt));
      const shader = doc.roots[0];
      const tex = shader && kvValue(shader, '$basetexture');
      if (tex) {
        const bytesVtf = this.lookup(`materials/${tex.replace(/\\/g, '/')}.vtf`);
        if (bytesVtf) return decodeBytes('x.vtf', bytesVtf);
      }
    }
    return null;
  }

  /** Forget cached results (all, or just these paths) so changed files reload. */
  invalidate(paths?: readonly string[]): void {
    if (!paths) {
      this.cache.clear();
      return;
    }
    for (const p of paths) this.cache.delete(p);
  }

  dispose(): void {
    for (const bmp of this.cache.values()) bmp?.close();
    this.cache.clear();
  }
}
