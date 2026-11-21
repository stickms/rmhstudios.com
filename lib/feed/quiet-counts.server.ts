/**
 * Quiet counts (sprint 04 #14) — server half: read and set the caller's two switches. The author switch rides on
 * the cached author display object (`hideCounts`), so a change drops that cache entry and every instance stops
 * serving the old numbers at once.
 */
import { prisma } from '@/lib/prisma.server';
import { invalidateUserDisplay } from '@/lib/user-display.server';

export interface QuietCountsSettings {
  hideCountsOnMine: boolean;
  hideCountsInFeed: boolean;
}

export async function getQuietCounts(userId: string): Promise<QuietCountsSettings> {
  const row = await prisma.userProfile.findUnique({
    where: { userId },
    select: { hideCountsOnMine: true, hideCountsInFeed: true },
  });
  return {
    hideCountsOnMine: row?.hideCountsOnMine ?? false,
    hideCountsInFeed: row?.hideCountsInFeed ?? false,
  };
}

/** Change only the switches given, for `userId` alone (the profile row is created on first use). */
export async function setQuietCounts(
  userId: string,
  update: Partial<QuietCountsSettings>,
): Promise<QuietCountsSettings> {
  const data = {
    ...(update.hideCountsOnMine !== undefined ? { hideCountsOnMine: update.hideCountsOnMine } : {}),
    ...(update.hideCountsInFeed !== undefined ? { hideCountsInFeed: update.hideCountsInFeed } : {}),
  };
  const row = await prisma.userProfile.upsert({
    where: { userId },
    create: { userId, ...data },
    update: data,
    select: { hideCountsOnMine: true, hideCountsInFeed: true },
  });
  if (update.hideCountsOnMine !== undefined) invalidateUserDisplay(userId);
  return row;
}
