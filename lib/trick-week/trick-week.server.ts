import { prisma } from '@/lib/prisma.server';
import { apiCache } from '@/lib/cache';
import { resolveUser, userDisplaySelect } from '@/lib/user-display';
import { previousWeekKey, type TrickView } from './trick-week';

const authorInclude = { author: { select: userDisplaySelect } } as const;

export function toTrickView(
  row: {
    id: string;
    authorId: string;
    level: number;
    score: number;
    multiplier: number;
    chain: string[];
    votes: number;
    author: Parameters<typeof resolveUser>[0];
  },
  viewerId: string | null,
): TrickView {
  return {
    id: row.id,
    author: resolveUser(row.author).name,
    level: row.level,
    score: row.score,
    multiplier: row.multiplier,
    chain: row.chain,
    votes: row.votes,
    mine: row.authorId === viewerId,
  };
}

export { authorInclude };

/**
 * Last week's winner, featured on the Nightrail game hub: the most-voted trick
 * of the week that just closed (ties go to the bigger score). Null when nobody
 * voted. A closed week never changes, so one cached read per week is enough.
 */
export async function getTrickOfTheWeek(): Promise<TrickView | null> {
  const week = previousWeekKey();
  const key = `nightrail:trick-of-week:${week}`;
  const hit = apiCache.get<TrickView | null>(key);
  if (hit !== undefined) return hit;
  const row = await prisma.nightrailTrick.findFirst({
    where: { week, votes: { gt: 0 } },
    orderBy: [{ votes: 'desc' }, { score: 'desc' }],
    include: authorInclude,
  });
  const view = row ? toTrickView(row, null) : null;
  apiCache.set(key, view, 10 * 60_000);
  return view;
}
