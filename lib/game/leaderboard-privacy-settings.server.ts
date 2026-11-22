/**
 * Leaderboard privacy — the member's own switch (sprint 05 #01): read it, set it, and drop the
 * cached hidden set so the next board read in this process sees the change.
 *
 * Kept apart from `leaderboard-privacy.server.ts`, which every public board imports: the boards
 * read the hidden set through a 60 s cache by design (the specification's "within a minute"), and
 * their data source does not change on a write, so they keep their micro-cache
 * (`lib/__tests__/api-micro-cache-optout.test.ts`). Only this settings path invalidates.
 */

import { prisma } from '@/lib/prisma.server';
import { invalidateCached } from '@/lib/cached.server';
import { LEADERBOARD_HIDDEN_CACHE_KEY } from '@/lib/game/leaderboard-privacy.server';

/** Drop the cached set here, so the next board read sees a switch that was just changed. */
export async function invalidateLeaderboardHidden(): Promise<void> {
  await invalidateCached(LEADERBOARD_HIDDEN_CACHE_KEY);
}

export async function getLeaderboardPrivacy(userId: string): Promise<{ hidden: boolean }> {
  const row = await prisma.userProfile.findUnique({
    where: { userId },
    select: { hideFromLeaderboards: true },
  });
  return { hidden: row?.hideFromLeaderboards ?? false };
}

/** Set the caller's own switch (the profile row is created on first use). */
export async function setLeaderboardHidden(userId: string, hidden: boolean): Promise<{ hidden: boolean }> {
  const row = await prisma.userProfile.upsert({
    where: { userId },
    create: { userId, hideFromLeaderboards: hidden },
    update: { hideFromLeaderboards: hidden },
    select: { hideFromLeaderboards: true },
  });
  await invalidateLeaderboardHidden();
  return { hidden: row.hideFromLeaderboards };
}
