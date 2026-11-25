/**
 * What `/predictions`, `/wager/$id` and `/compete` ask on the server before they draw anything that stakes coins.
 *
 * Decided in the route's loader (`exclusion-page.functions.ts`), so the notice is in the HTML with scripting off.
 */
import { prisma } from '@/lib/prisma.server';
import type { ExclusionNotice } from '@/lib/economy/risk-surfaces';

/**
 * Is this member self-excluded right now, and until when? A signed-out viewer (null) is never excluded; an expired
 * exclusion and a cool-off are not either, because only self-exclusion hides anything.
 */
export async function readExclusionNotice(userId: string | null, now: Date = new Date()): Promise<ExclusionNotice> {
  if (!userId) return { excluded: false };
  const row = await prisma.userPlayLimits.findUnique({
    where: { userId },
    select: { selfExcludedUntil: true },
  });
  const until = row?.selfExcludedUntil ?? null;
  if (!until || until.getTime() <= now.getTime()) return { excluded: false };
  return { excluded: true, until: until.toISOString() };
}
