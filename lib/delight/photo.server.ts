/** Z6 — photo of the day: one upload-nomination and one vote per member per UTC day. */
import { prisma } from '@/lib/prisma.server';
import { resolveUser, userDisplaySelect } from '@/lib/user-display';
import { addDays, utcDay } from '@/lib/delight/schema';

const select = {
  id: true,
  dayKey: true,
  imageUrl: true,
  caption: true,
  votes: true,
  user: { select: userDisplaySelect },
} as const;

type Row = {
  id: string;
  dayKey: string;
  imageUrl: string;
  caption: string;
  votes: number;
  user: Parameters<typeof resolveUser>[0];
};
const view = (r: Row, viewerId: string | null) => ({
  id: r.id,
  dayKey: r.dayKey,
  imageUrl: r.imageUrl,
  caption: r.caption,
  votes: r.votes,
  mine: viewerId === r.user.id,
  by: resolveUser(r.user),
});

export async function nominate(userId: string, imageUrl: string, caption: string) {
  const dayKey = utcDay();
  const exists = await prisma.photoNomination.findUnique({
    where: { userId_dayKey: { userId, dayKey } },
    select: { id: true },
  });
  if (exists) return null;
  return prisma.photoNomination
    .create({ data: { userId, dayKey, imageUrl, caption }, select: { id: true } })
    .catch(() => null); // lost a race with the unique index: same answer
}

export async function photoPage(viewerId: string | null) {
  const today = utcDay();
  const [nominations, mine, recent] = await Promise.all([
    prisma.photoNomination.findMany({
      where: { dayKey: today },
      orderBy: [{ votes: 'desc' }, { createdAt: 'asc' }],
      take: 60,
      select,
    }),
    viewerId
      ? prisma.photoVote.findUnique({
          where: { userId_dayKey: { userId: viewerId, dayKey: today } },
          select: { nominationId: true },
        })
      : null,
    prisma.photoNomination.findMany({
      where: { dayKey: { gte: addDays(today, -7), lt: today }, votes: { gt: 0 } },
      orderBy: [{ dayKey: 'desc' }, { votes: 'desc' }, { createdAt: 'asc' }],
      take: 200,
      select,
    }),
  ]);
  // Rows arrive best-first within each day, so the first row per day is its winner.
  const winners = new Map<string, Row>();
  for (const r of recent) if (!winners.has(r.dayKey)) winners.set(r.dayKey, r);
  return {
    today,
    votedFor: mine?.nominationId ?? null,
    nominations: nominations.map((r) => view(r, viewerId)),
    winners: [...winners.values()].map((r) => view(r, viewerId)),
  };
}

export type VoteResult = 'ok' | 'not-found' | 'own' | 'already';

export async function castVote(userId: string, nominationId: string): Promise<VoteResult> {
  const today = utcDay();
  const n = await prisma.photoNomination.findUnique({
    where: { id: nominationId },
    select: { userId: true, dayKey: true },
  });
  if (!n || n.dayKey !== today) return 'not-found';
  if (n.userId === userId) return 'own';
  try {
    await prisma.$transaction([
      prisma.photoVote.create({ data: { nominationId, userId, dayKey: today } }),
      prisma.photoNomination.update({
        where: { id: nominationId },
        data: { votes: { increment: 1 } },
      }),
    ]);
  } catch {
    return 'already'; // unique (userId, dayKey)
  }
  return 'ok';
}

/** Owner or admin may take a nomination down. */
export async function removeNomination(
  id: string,
  userId: string,
  isAdmin: boolean,
): Promise<boolean> {
  const res = await prisma.photoNomination.deleteMany({
    where: isAdmin ? { id } : { id, userId },
  });
  return res.count > 0;
}
