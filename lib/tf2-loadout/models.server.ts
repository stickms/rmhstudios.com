/**
 * Item 3D models, as GLB files in the site's object storage under
 * `tf2-models/<defindex>.glb` (or `<defindex>_<class>.glb` for an item with one model per class). Valve's models are not distributed with the
 * item schema, so they are converted once from a game install and uploaded
 * (`scripts/tf2-models/upload.ts`, docs/tf2-hub.md); this module only serves
 * what is there. Anything not uploaded simply has no 3D view.
 */

import { getObject, listObjects } from '@/lib/storage/s3.server';

const PREFIX = 'tf2-models/';
const LIST_TTL_MS = 5 * 60_000;

let listed: { at: number; ids: string[] } | null = null;

/** `name` is `<defindex>` or `<defindex>_<class>` (a per-class variant). */
export const modelKey = (name: string): string => `${PREFIX}${name}.glb`;

export const MODEL_NAME = /^\d{1,7}(?:_[a-z]{3,10})?$/;

/** Names (`940`, `940_soldier`) of the models that exist, cached for a few minutes. */
export async function listModelIds(): Promise<string[]> {
  if (listed && Date.now() - listed.at < LIST_TTL_MS) return listed.ids;
  const keys = await listObjects(PREFIX, 20_000);
  const ids = keys
    .map((k) => /^tf2-models\/(\d+(?:_[a-z]+)?)\.glb$/.exec(k)?.[1])
    .filter((v): v is string => v !== undefined)
    .sort();
  listed = { at: Date.now(), ids };
  return ids;
}

export async function readModel(name: string): Promise<Buffer | null> {
  if (!MODEL_NAME.test(name)) return null;
  const obj = await getObject(modelKey(name));
  return obj ? obj.body : null;
}
