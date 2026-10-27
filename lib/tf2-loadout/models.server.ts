/**
 * Item 3D models, as GLB files in the site's object storage under
 * `tf2-models/<defindex>.glb` (or `<defindex>_<class>.glb` for an item with one model per class). Valve's models are not distributed with the
 * item schema, so they are converted once from a game install and uploaded
 * (`scripts/tf2-models/upload.ts`, docs/tf2-hub.md); this module only serves
 * what is there. Anything not uploaded simply has no 3D view.
 */

import { brotliDecompressSync } from 'node:zlib';
import { getObjectEncoded, listObjects } from '@/lib/storage/s3.server';

const PREFIX = 'tf2-models/';
const LIST_TTL_MS = 5 * 60_000;

let listed: { at: number; ids: string[] } | null = null;

/** `name` is `<defindex>` or `<defindex>_<class>` (a per-class variant). */
export const modelKey = (name: string): string => `${PREFIX}${name}.glb`;

/**
 * `940`, `940_soldier`, a class body (`class_soldier`), or one of its animation clips
 * (`anim_soldier_taunt_conga`: the skeleton and a single clip, no mesh).
 */
export const MODEL_NAME =
  /^(?:\d{1,7}(?:_[a-z]{3,10})?(?:_s\d{1,3})?|class_[a-z]{3,10}|anim_[a-z]{3,10}_[a-z0-9_]{1,64})$/;

export const ANIM_INDEX_KEY = `${PREFIX}anims.json`;

/** Names (`940`, `940_soldier`) of the models that exist, cached for a few minutes. */
export async function listModelIds(): Promise<string[]> {
  if (listed && Date.now() - listed.at < LIST_TTL_MS) return listed.ids;
  const keys = await listObjects(PREFIX, 20_000);
  const ids = keys
    .map((k) => /^tf2-models\/(\d+(?:_[a-z]+)?(?:_s\d+)?|class_[a-z]+)\.glb$/.exec(k)?.[1])
    .filter((v): v is string => v !== undefined)
    .sort();
  listed = { at: Date.now(), ids };
  return ids;
}

/**
 * One model, ready to send. The sync stores GLBs Brotli-compressed; a browser
 * that accepts `br` gets those bytes untouched (no CPU, smallest transfer),
 * anything else gets them inflated.
 */
export async function readModel(
  name: string,
  acceptEncoding = '',
): Promise<{ body: Buffer; contentEncoding?: 'br' } | null> {
  if (!MODEL_NAME.test(name)) return null;
  const stored = await getObjectEncoded(modelKey(name));
  if (!stored) return null;
  if (stored.contentEncoding !== 'br') return { body: stored.body };
  if (/\bbr\b/.test(acceptEncoding)) return { body: stored.body, contentEncoding: 'br' };
  try {
    return { body: brotliDecompressSync(stored.body) };
  } catch {
    return { body: stored.body };
  }
}

/**
 * `anims.json`, the sync's index of animation clips: which clips each class has, and which clip each taunt
 * item plays. Stored Brotli-compressed like the models; always sent decoded (it is a few KB).
 */
export async function readAnimIndex(): Promise<string | null> {
  const stored = await getObjectEncoded(ANIM_INDEX_KEY);
  if (!stored) return null;
  if (stored.contentEncoding !== 'br') return stored.body.toString('utf8');
  try {
    return brotliDecompressSync(stored.body).toString('utf8');
  } catch {
    return null;
  }
}
