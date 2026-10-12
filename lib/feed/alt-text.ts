/**
 * Require-alt-text mode (X12) — client-safe half.
 *
 * Mastodon-style account setting: when on, a post with images cannot be
 * published unless every image carries a description. The composer checks with
 * `missingAltIndexes` so it can say which image still needs one; the server
 * runs the same function on create, because a client check alone is a courtesy.
 */

import { z } from 'zod';

export const altTextSettingSchema = z.object({ requireAltText: z.boolean() });

/** Indexes of images whose description is missing or blank. */
export function missingAltIndexes(
  imageUrls: readonly string[] | undefined,
  imageAlts: readonly string[] | undefined,
): number[] {
  const missing: number[] = [];
  (imageUrls ?? []).forEach((_, i) => {
    if (!imageAlts?.[i]?.trim()) missing.push(i);
  });
  return missing;
}
