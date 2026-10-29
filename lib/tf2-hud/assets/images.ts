/**
 * Image loading for the preview.
 *
 * The scene refers to textures by extension-less project path
 * (`materials/hud/health_bg`). `ImageStore` resolves each one the way the game
 * does — through its material: `.vmt` → `$basetexture` → `.vtf`, honouring
 * `patch` includes, `$color`, `$alpha`, `$additive`, `$translucent`/`$alphatest`
 * and `$frame` — and falls back to PNG/JPEG/VTF files at the path itself.
 * Bytes are fetched on demand (`setEnsure`) since the base ships hundreds of
 * textures that no single page needs. Each result is decoded once and cached;
 * a texture that cannot be found or decoded is remembered as missing (drawn as
 * the engine's pink/black checkerboard) until `invalidate`.
 */

import { decodeUtf8 } from '../util/sha1';
import { decodeVtf } from './vtf';
import {
  materialInfo,
  normaliseMaterialPath,
  parseVmt,
  type MaterialInfo,
  type VmtDoc,
} from './vmt';

export type BytesLookup = (path: string) => Uint8Array | undefined;
/** Make sure these project paths are available to `lookup` (e.g. fetch them from the base). */
export type EnsureBytes = (paths: string[]) => Promise<void>;

/** A decoded texture plus how the material says to blend it. */
export interface Texture {
  bitmap: ImageBitmap;
  width: number;
  height: number;
  /** `$additive`: blend with `lighter` rather than normal alpha. */
  additive: boolean;
  /** `$alpha`: extra opacity multiplier, 0–1. */
  alpha: number;
}

const DIRECT_EXTENSIONS = ['png', 'jpg', 'jpeg', 'vtf'] as const;
const MAX_PATCH_DEPTH = 4;

/** Bake the material's colour/alpha rules into the pixels so drawing is a plain blit. */
export function applyMaterial(data: Uint8ClampedArray, info: MaterialInfo | null): void {
  if (!info) return;
  const [cr, cg, cb] = info.color ?? [255, 255, 255];
  const tint = cr !== 255 || cg !== 255 || cb !== 255;
  const ref = info.alphaRef * 255;
  for (let i = 0; i < data.length; i += 4) {
    if (tint) {
      data[i] = (data[i] * cr) / 255;
      data[i + 1] = (data[i + 1] * cg) / 255;
      data[i + 2] = (data[i + 2] * cb) / 255;
    }
    if (info.alphatest) data[i + 3] = data[i + 3] >= ref ? 255 : 0;
    else if (!info.usesAlpha) data[i + 3] = 255;
  }
}

async function toBitmap(
  width: number,
  height: number,
  data: Uint8ClampedArray,
): Promise<ImageBitmap | null> {
  try {
    return await createImageBitmap(
      new ImageData(data as Uint8ClampedArray<ArrayBuffer>, width, height),
    );
  } catch {
    return null;
  }
}

/** Whether any texture/material file differs between two overlays (the only edits that can change a decoded image). */
export function materialsChanged(
  a: ReadonlyMap<string, unknown>,
  b: ReadonlyMap<string, unknown>,
): boolean {
  if (a === b) return false;
  const isMat = (p: string) => p.startsWith('materials/');
  for (const [p, v] of b) if (isMat(p) && a.get(p) !== v) return true;
  for (const p of a.keys()) if (isMat(p) && !b.has(p)) return true;
  return false;
}

export class ImageStore {
  private cache = new Map<string, Texture | null>();
  private pending = new Map<string, Promise<void>>();
  /** Nothing resolves until a real lookup is installed, so an early paint never caches "missing". */
  private ready = false;

  constructor(
    private lookup: BytesLookup,
    private readonly onChange: () => void,
    private ensure?: EnsureBytes,
  ) {}

  setLookup(lookup: BytesLookup): void {
    this.lookup = lookup;
    this.ready = true;
  }

  setEnsure(ensure: EnsureBytes | undefined): void {
    this.ensure = ensure;
  }

  /** `undefined` = still loading, `null` = missing/undecodable. */
  get(path: string): Texture | null | undefined {
    if (this.cache.has(path)) return this.cache.get(path);
    if (!this.ready) return undefined;
    if (!this.pending.has(path)) {
      const p = this.resolve(path).then((tex) => {
        this.cache.set(path, tex);
        this.pending.delete(path);
        this.onChange();
      });
      this.pending.set(path, p);
    }
    return undefined;
  }

  /** Bytes for a project path, fetching on demand. Material paths are case-insensitive in the engine; the base is lower-case. */
  private async bytes(path: string): Promise<Uint8Array | undefined> {
    const candidates = path === path.toLowerCase() ? [path] : [path, path.toLowerCase()];
    for (const p of candidates) {
      const have = this.lookup(p);
      if (have) return have;
    }
    if (!this.ensure) return undefined;
    for (const p of candidates) {
      try {
        await this.ensure([p]);
      } catch {
        continue;
      }
      const got = this.lookup(p);
      if (got) return got;
    }
    return undefined;
  }

  /** The material at `materials/<path>.vmt`, with `patch` includes merged in. */
  private async material(
    materialPath: string,
    depth = 0,
  ): Promise<{ doc: VmtDoc; params: Map<string, string> } | null> {
    const bytes = await this.bytes(`materials/${materialPath}.vmt`);
    if (!bytes) return null;
    const doc = parseVmt(decodeUtf8(bytes));
    if (!doc) return null;
    if (doc.shader !== 'patch' || !doc.include || depth >= MAX_PATCH_DEPTH) {
      return { doc, params: doc.params };
    }
    const base = await this.material(doc.include, depth + 1);
    if (!base) return { doc, params: doc.params };
    return { doc: base.doc, params: new Map([...base.params, ...doc.params]) };
  }

  private async resolve(path: string): Promise<Texture | null> {
    // `path` is `materials/<name>`: the material is authoritative when there is one.
    const name = path.replace(/^materials\//i, '');
    const mat = await this.material(normaliseMaterialPath(name));
    if (mat) {
      const info = materialInfo(mat.doc, mat.params);
      if (!info.baseTexture) return null;
      const vtf = await this.bytes(`materials/${info.baseTexture}.vtf`);
      const img = vtf ? decodeVtf(vtf, { frame: info.frame }) : null;
      if (!img) return null;
      applyMaterial(img.data, info);
      const bitmap = await toBitmap(img.width, img.height, img.data);
      return bitmap
        ? {
            bitmap,
            width: img.width,
            height: img.height,
            additive: info.additive,
            alpha: info.alpha,
          }
        : null;
    }
    // No material: a file the editor wrote itself (PNG/JPEG) or a bare VTF.
    for (const ext of DIRECT_EXTENSIONS) {
      const bytes = await this.bytes(`${path}.${ext}`);
      if (!bytes) continue;
      if (ext === 'vtf') {
        const img = decodeVtf(bytes);
        const bitmap = img && (await toBitmap(img.width, img.height, img.data));
        if (img && bitmap) {
          return { bitmap, width: img.width, height: img.height, additive: false, alpha: 1 };
        }
        continue;
      }
      try {
        const type = ext === 'png' ? 'image/png' : 'image/jpeg';
        const bitmap = await createImageBitmap(new Blob([bytes as BlobPart], { type }));
        return { bitmap, width: bitmap.width, height: bitmap.height, additive: false, alpha: 1 };
      } catch {
        continue;
      }
    }
    return null;
  }

  /**
   * Start resolving `paths` and wait until each has either decoded or turned out missing — so a HUD can
   * be swapped in only once its textures are ready (the in-game HUD keeps the old one until then).
   */
  async preload(paths: readonly string[]): Promise<void> {
    for (const p of paths) this.get(p);
    await Promise.all(paths.map((p) => this.pending.get(p)).filter((p): p is Promise<void> => !!p));
  }

  /** Forget cached results (all, or just these paths) so changed files reload. */
  invalidate(paths?: readonly string[]): void {
    if (!paths) {
      for (const t of this.cache.values()) t?.bitmap.close();
      this.cache.clear();
      return;
    }
    for (const p of paths) {
      this.cache.get(p)?.bitmap.close();
      this.cache.delete(p);
    }
  }

  dispose(): void {
    this.invalidate();
  }
}
