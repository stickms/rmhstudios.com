import { prisma } from '@/lib/prisma.server';
import { cleanShowcase, badgeKey } from '@/lib/games/showcase';
import { cleanLook, unlocksFromBadges, type Unlocks } from '@/lib/games/customize';

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

/** What the member's badges unlock: backgrounds, frames, emoticon titles. */
export async function getUnlocks(userId: string): Promise<Unlocks> {
  const badges = await prisma.gameBadge.findMany({
    where: { userId },
    select: { gameId: true, foil: true, level: true },
  });
  return unlocksFromBadges(badges);
}

/** Save the chosen background and frame; anything the member has not unlocked becomes "none". */
export async function saveLook(
  userId: string,
  input: { background: unknown; frame: unknown },
): Promise<{ background: string | null; frame: string | null }> {
  const clean = cleanLook(input, await getUnlocks(userId));
  await prisma.gameProfileShowcase.upsert({
    where: { userId },
    create: { userId, background: clean.background, frame: clean.frame },
    update: { background: clean.background, frame: clean.frame },
  });
  return clean;
}

export async function getLook(userId: string): Promise<{ background: string | null; frame: string | null }> {
  const row = await prisma.gameProfileShowcase.findUnique({
    where: { userId },
    select: { background: true, frame: true },
  });
  return { background: row?.background ?? null, frame: row?.frame ?? null };
}
