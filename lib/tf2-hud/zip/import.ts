/**
 * Zip → project overlay.
 *
 * A HUD zip is untrusted input: it may nest the HUD in any number of folders,
 * carry junk from the OS that made it, use any letter case TF2 would accept on
 * Windows, and — maliciously — contain traversal paths, thousands of entries or
 * a tiny archive that inflates to gigabytes. Every one of those is handled
 * here, before anything reaches the project.
 */

import type JSZip from 'jszip';
import {
  ALLOWED_HUD_EXTENSIONS,
  HUD_ROOT_FOLDERS,
  extOf,
  isTextPath,
  sanitizePath,
} from '../project/paths';
import { binaryContent, textFromBytes } from '../project/model';
import { HUD_LIMITS } from '../api-types';
import { decodeUtf8 } from '../util/sha1';
import type { BaseIndex, FileContent, Overlay } from '../project/types';

export interface ImportLimits {
  maxEntries: number;
  maxFileBytes: number;
  maxTotalBytes: number;
}

export const DEFAULT_IMPORT_LIMITS: ImportLimits = {
  maxEntries: 5000,
  maxFileBytes: HUD_LIMITS.maxBlobBytes,
  maxTotalBytes: HUD_LIMITS.maxTotalBytes * 2,
};

export class ImportError extends Error {
  constructor(
    message: string,
    readonly code: 'not-a-zip' | 'too-many-entries' | 'too-large' | 'no-hud',
  ) {
    super(message);
    this.name = 'ImportError';
  }
}

const JUNK =
  /(^|\/)(__macosx|\.git|\.svn|\.idea|\.vscode|node_modules)(\/|$)|(^|\/)(\.ds_store|thumbs\.db|desktop\.ini)$/i;

export interface ImportResult {
  overlay: Overlay;
  /** Files taken from the zip that differ from the base (or are new). */
  changed: number;
  /** Files identical to the base, dropped from the overlay. */
  unchanged: number;
  /** Folder inside the zip that was treated as the HUD root ('' = top level). */
  root: string;
  warnings: string[];
  /** `info.vdf` text if the zip had one. */
  infoVdf?: string;
}

interface StreamHelper {
  on(event: string, cb: (arg?: never) => void): StreamHelper;
  pause(): void;
  resume(): void;
}

interface Streamable {
  internalStream(type: 'uint8array'): StreamHelper;
}

function readLimited(entry: JSZip.JSZipObject, limit: number, name: string): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const chunks: Uint8Array[] = [];
    let total = 0;
    let done = false;
    const stream = (entry as unknown as Streamable).internalStream('uint8array');
    stream
      .on('data', ((chunk: Uint8Array) => {
        if (done) return;
        total += chunk.length;
        if (total > limit) {
          done = true;
          stream.pause();
          reject(new ImportError(`"${name}" is larger than the allowed file size`, 'too-large'));
          return;
        }
        chunks.push(chunk);
      }) as never)
      .on('error', ((err: Error) => {
        if (!done) {
          done = true;
          reject(err);
        }
      }) as never)
      .on('end', (() => {
        if (done) return;
        done = true;
        const out = new Uint8Array(total);
        let o = 0;
        for (const c of chunks) {
          out.set(c, o);
          o += c.length;
        }
        resolve(out);
      }) as never);
    stream.resume();
  });
}

/** Pick the folder that holds the HUD: the one with the most HUD-shaped children. */
export function detectRoot(paths: readonly string[]): string {
  const score = new Map<string, number>();
  for (const p of paths) {
    const segs = p.split('/');
    for (let i = 0; i < segs.length - 1; i++) {
      if ((HUD_ROOT_FOLDERS as readonly string[]).includes(segs[i].toLowerCase())) {
        const root = segs.slice(0, i).join('/');
        score.set(root, (score.get(root) ?? 0) + 1);
        break;
      }
    }
    if (segs[segs.length - 1].toLowerCase() === 'info.vdf') {
      const root = segs.slice(0, -1).join('/');
      score.set(root, (score.get(root) ?? 0) + 1);
    }
  }
  let best = '';
  let bestScore = -1;
  for (const [root, s] of score) {
    if (s > bestScore || (s === bestScore && root.length < best.length)) {
      best = root;
      bestScore = s;
    }
  }
  return bestScore < 0 ? '' : best;
}

/** Map a path onto the base's letter case when they match case-insensitively. */
function caseNormaliser(base: BaseIndex | undefined): (path: string) => string {
  const lowerToBase = new Map<string, string>();
  if (base) for (const p of base.files.keys()) lowerToBase.set(p.toLowerCase(), p);
  return (path) => {
    const hit = lowerToBase.get(path.toLowerCase());
    if (hit) return hit;
    const segs = path.split('/');
    if ((HUD_ROOT_FOLDERS as readonly string[]).includes(segs[0].toLowerCase())) {
      segs[0] = segs[0].toLowerCase();
    }
    return segs.join('/');
  };
}

export async function importZip(
  data: ArrayBuffer | Uint8Array | Blob,
  base: BaseIndex | undefined,
  limits: ImportLimits = DEFAULT_IMPORT_LIMITS,
): Promise<ImportResult> {
  const { default: JSZipCtor } = await import('jszip');
  let zip: JSZip;
  try {
    zip = await JSZipCtor.loadAsync(data);
  } catch {
    throw new ImportError('That file is not a valid zip archive', 'not-a-zip');
  }

  const warnings: string[] = [];
  const files = Object.values(zip.files).filter((f) => !f.dir);
  if (files.length > limits.maxEntries) {
    throw new ImportError(
      `The archive has ${files.length} files; the limit is ${limits.maxEntries}`,
      'too-many-entries',
    );
  }

  const clean: { entry: JSZip.JSZipObject; path: string }[] = [];
  let rejected = 0;
  for (const entry of files) {
    if (JUNK.test(entry.name.replace(/\\/g, '/'))) continue;
    const safe = sanitizePath(entry.name);
    if (!safe) {
      rejected++;
      continue;
    }
    clean.push({ entry, path: safe });
  }
  if (rejected) warnings.push(`${rejected} file(s) with unsafe paths were skipped`);

  const root = detectRoot(clean.map((c) => c.path));
  const prefix = root ? `${root}/` : '';
  const normalise = caseNormaliser(base);

  const overlay = new Map<string, FileContent | null>();
  let total = 0;
  let unchanged = 0;
  let skippedType = 0;
  let skippedOutside = 0;
  let infoVdf: string | undefined;
  let sawHudFile = false;

  for (const { entry, path } of clean) {
    if (prefix && !path.startsWith(prefix)) {
      skippedOutside++;
      continue;
    }
    const rel = normalise(prefix ? path.slice(prefix.length) : path);
    const first = rel.split('/')[0].toLowerCase();
    const inHudFolder = (HUD_ROOT_FOLDERS as readonly string[]).includes(first);
    // Outside the HUD folders only `info.vdf` is meaningful; READMEs, licences
    // and stray files are regenerated or ignored.
    if (!inHudFolder && rel.toLowerCase() !== 'info.vdf') {
      skippedOutside++;
      continue;
    }
    if (!ALLOWED_HUD_EXTENSIONS.has(extOf(rel))) {
      skippedType++;
      continue;
    }

    const bytes = await readLimited(entry, limits.maxFileBytes, rel);
    total += bytes.length;
    if (total > limits.maxTotalBytes) {
      throw new ImportError('The archive is too large once extracted', 'too-large');
    }

    if (rel.toLowerCase() === 'info.vdf') {
      infoVdf = decodeUtf8(bytes);
      continue;
    }
    if (inHudFolder) sawHudFile = true;

    const content = isTextPath(rel) ? textFromBytes(bytes) : binaryContent(bytes);
    if (overlay.has(rel)) warnings.push(`"${rel}" appears twice; the last copy was used`);
    if (base?.files.get(rel)?.sha1 === content.sha1) {
      unchanged++;
      overlay.delete(rel);
      continue;
    }
    overlay.set(rel, content);
  }

  if (!sawHudFile) {
    throw new ImportError(
      'No HUD files found — expected resource/, scripts/, materials/ or sound/',
      'no-hud',
    );
  }
  if (skippedType) warnings.push(`${skippedType} file(s) of unsupported types were skipped`);
  if (skippedOutside)
    warnings.push(`${skippedOutside} file(s) outside the HUD folders were skipped`);

  return { overlay, changed: overlay.size, unchanged, root, warnings, infoVdf };
}
