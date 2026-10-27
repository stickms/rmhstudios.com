/**
 * Item inventory icons as published by the TF2 asset sync (`scripts/tf2-assets/icons.py`):
 * small WebP files under `tf2-icons/<defindex>.webp`, converted from the game's own
 * `materials/backpack` textures. This module only serves what is there; a tile
 * whose icon is missing falls back to the item's initials.
 */

import { getObject } from '@/lib/storage/s3.server';

export const ICON_NAME = /^\d{1,7}$/;

export const iconKey = (id: string): string => `tf2-icons/${id}.webp`;

export async function readIcon(id: string): Promise<Buffer | null> {
  if (!ICON_NAME.test(id)) return null;
  const obj = await getObject(iconKey(id));
  return obj ? obj.body : null;
}
