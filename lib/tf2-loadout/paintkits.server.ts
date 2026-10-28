/**
 * War paint data as published by the TF2 asset sync (`scripts/tf2-assets/paintkits.py`): each kit's
 * pattern script (`kits/<script>.json`) and the textures the scripts look up (`tex/<path>.webp`), under
 * `tf2-paintkits/` in object storage. This module only serves what is there; a weapon whose kit has not
 * been synced simply shows without its paint.
 */

import { brotliDecompressSync } from 'node:zlib';
import { readStored } from './stored-cache.server';

const PREFIX = 'tf2-paintkits/';

const TYPES: Record<string, string> = {
  json: 'application/json',
  webp: 'image/webp',
};

const SAFE_PATH = /^(?:kits\/[a-z0-9_]+\.json|tex\/(?:[a-z0-9_-]+\/)*[a-z0-9_-]+\.webp)$/;

/** Rejects traversal, odd characters and anything that is not a kit script or a kit texture. */
export function isSafePaintkitPath(path: string): boolean {
  return path.length <= 300 && !path.includes('..') && SAFE_PATH.test(path);
}

export async function readPaintkitFile(
  path: string,
  acceptEncoding = '',
): Promise<{ body: Buffer; contentEncoding?: 'br'; contentType: string } | null> {
  if (!isSafePaintkitPath(path)) return null;
  const contentType = TYPES[path.slice(path.lastIndexOf('.') + 1)];
  const stored = await readStored(PREFIX + path);
  if (!stored) return null;
  if (stored.contentEncoding !== 'br') return { body: stored.body, contentType };
  if (/\bbr\b/.test(acceptEncoding))
    return { body: stored.body, contentEncoding: 'br', contentType };
  try {
    return { body: brotliDecompressSync(stored.body), contentType };
  } catch {
    return { body: stored.body, contentType };
  }
}
