import { prisma } from '@/lib/prisma.server';
import { cleanShowcase, badgeKey } from '@/lib/games/showcase';

/** What the member owns, as the sets `cleanShowcase` checks against. */
async function owned(userId: string) {
  const [ach, badges] = await Promise.all([
    prisma.userAchievement.findMany({
      where: { userId, unlockedAt: { not: null } },
      select: { achievementId: true },
    }),
    prisma.gameBadge.findMany({ where: { userId }, select: { gameId: true, foil: true } }),
  ]);
  return {
    achievements: new Set(ach.map((a) => a.achievementId)),
    badges: new Set(badges.map((b) => badgeKey(b.gameId, b.foil))),
  };
}

/** Save the member's featured achievements and badges; only things they own are kept. */
export async function saveShowcase(
  userId: string,
  input: { achievements: unknown[]; badges: unknown[] },
): Promise<{ achievements: string[]; badges: string[] }> {
  const clean = cleanShowcase(input, await owned(userId));
  await prisma.gameProfileShowcase.upsert({
    where: { userId },
    create: { userId, achievementIds: clean.achievements, badges: clean.badges },
    update: { achievementIds: clean.achievements, badges: clean.badges },
  });
  return clean;
}

export async function getShowcase(userId: string): Promise<{ achievements: string[]; badges: string[] }> {
  const row = await prisma.gameProfileShowcase.findUnique({
    where: { userId },
    select: { achievementIds: true, badges: true },
  });
  return { achievements: row?.achievementIds ?? [], badges: row?.badges ?? [] };
}
