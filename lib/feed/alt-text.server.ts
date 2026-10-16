/**
 * Require-alt-text mode (X12) — server half. One boolean on the user row; the
 * lookup only happens when a post actually carries images, so text posts (the
 * overwhelming majority) never pay for it.
 */

import { prisma } from '@/lib/prisma.server';
import { missingAltIndexes } from '@/lib/feed/alt-text';

export async function getRequireAltText(userId: string): Promise<boolean> {
  const row = await prisma.user.findUnique({
    where: { id: userId },
    select: { requireAltText: true },
  });
  return row?.requireAltText ?? false;
}

export async function setRequireAltText(userId: string, value: boolean): Promise<boolean> {
  await prisma.user.update({ where: { id: userId }, data: { requireAltText: value } });
  return value;
}

/**
 * An error message when this post breaks the author's require-alt-text setting,
 * otherwise null. Call it with the images and alts of a post about to be saved.
 */
export async function altTextViolation(
  userId: string,
  imageUrls: readonly string[] | undefined,
  imageAlts: readonly string[] | undefined,
): Promise<string | null> {
  if (!imageUrls?.length) return null;
  if (missingAltIndexes(imageUrls, imageAlts).length === 0) return null;
  if (!(await getRequireAltText(userId))) return null;
  return 'Add a description to every image (you have "Require alt text" turned on)';
}
