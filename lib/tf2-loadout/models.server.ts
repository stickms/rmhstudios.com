/**
 * Item 3D models, as GLB files in the site's object storage under
 * `tf2-models/<defindex>.glb`. Valve's models are not distributed with the
 * item schema, so they are converted once from a game install and uploaded
 * (`scripts/tf2-models/upload.ts`, docs/tf2-hub.md); this module only serves
 * what is there. Anything not uploaded simply has no 3D view.
 */

import { getObject, listObjects } from '@/lib/storage/s3.server';

const PREFIX = 'tf2-models/';
const LIST_TTL_MS = 5 * 60_000;

let listed: { at: number; ids: number[] } | null = null;

export const modelKey = (id: number): string => `${PREFIX}${id}.glb`;

/** Defindexes that have a model, cached for a few minutes. */
export async function listModelIds(): Promise<number[]> {
  if (listed && Date.now() - listed.at < LIST_TTL_MS) return listed.ids;
  const keys = await listObjects(PREFIX, 20_000);
  const ids = keys
    .map((k) => /^tf2-models\/(\d+)\.glb$/.exec(k)?.[1])
    .filter((v): v is string => v !== undefined)
    .map(Number)
    .sort((a, b) => a - b);
  listed = { at: Date.now(), ids };
  return ids;
}

export async function readModel(id: number): Promise<Buffer | null> {
  const obj = await getObject(modelKey(id));
  return obj ? obj.body : null;
}
