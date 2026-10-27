/**
 * The HUD editor's base files as published by the TF2 asset sync
 * (`scripts/tf2-assets`, `.github/workflows/tf2-assets-sync.yml`): the game's own
 * panels, schemes, materials and textures under `tf2-hud-base/` in object
 * storage, stored Brotli-compressed. This module only serves what is there;
 * when nothing has been published the editor falls back to the copy shipped in
 * `public/tf2-hud/base`.
 */

import { brotliDecompressSync } from 'node:zlib';
import { getObjectEncoded } from '@/lib/storage/s3.server';

const PREFIX = 'tf2-hud-base/';

/** Content types for the few extensions a HUD base holds. */
export const BASE_TYPES: Record<string, string> = {
  res: 'text/plain; charset=utf-8',
  txt: 'text/plain; charset=utf-8',
  menu: 'text/plain; charset=utf-8',
  vmt: 'text/plain; charset=utf-8',
  vtf: 'application/octet-stream',
  json: 'application/json',
};

const SAFE_PATH = /^(?:[a-z0-9_][a-z0-9_.\- ]*\/)*[a-z0-9_][a-z0-9_.\- ]*\.(res|txt|menu|vmt|vtf|json)$/i;

/** Rejects traversal, odd characters and anything that is not a HUD file type. */
export function isSafeBasePath(path: string): boolean {
  return path.length <= 300 && !path.includes('..') && SAFE_PATH.test(path);
}

export async function readBaseFile(
  path: string,
  acceptEncoding = '',
): Promise<{ body: Buffer; contentEncoding?: 'br'; contentType: string } | null> {
  if (!isSafeBasePath(path)) return null;
  const contentType = BASE_TYPES[path.slice(path.lastIndexOf('.') + 1).toLowerCase()];
  const stored = await getObjectEncoded(PREFIX + path);
  if (!stored) return null;
  if (stored.contentEncoding !== 'br') return { body: stored.body, contentType };
  if (/\bbr\b/.test(acceptEncoding)) return { body: stored.body, contentEncoding: 'br', contentType };
  try {
    return { body: brotliDecompressSync(stored.body), contentType };
  } catch {
    return { body: stored.body, contentType };
  }
}
