/** Birthdays (G1) — server side. */
import { prisma } from '@/lib/prisma.server';
import { createNotification } from '@/lib/notifications.server';
import { userChipSelect } from '@/lib/user-display';
import { isBirthdayOn, nextBirthdayAt, observedDay } from '@/lib/gifting/birthday';

/** Followers nudged per birthday. Bounded so a huge account cannot stall the job. */
export const BIRTHDAY_FOLLOWER_CAP = 1000;

export function getBirthday(userId: string) {
  return prisma.userBirthday.findUnique({
    where: { userId },
    select: { month: true, day: true },
  });
}

export async function setBirthday(userId: string, month: number, day: number, now = new Date()) {
  // Changing the date must not re-trigger this year's nudge: if the new date has
  // already come round this year, mark the year as done.
  const year = now.getUTCFullYear();
  const passed =
    Date.UTC(year, month - 1, observedDay(month, day, year)) <=
    Date.UTC(year, now.getUTCMonth(), now.getUTCDate());
  const lastNotifiedYear = passed ? year : null;
  await prisma.userBirthday.upsert({
    where: { userId },
    create: { userId, month, day, lastNotifiedYear },
    update: { month, day, lastNotifiedYear },
  });
}

export async function clearBirthday(userId: string) {
  await prisma.userBirthday.deleteMany({ where: { userId } });
}

/** True when this user opted in and today is their day. */
export async function isBirthdayToday(userId: string, now = new Date()): Promise<boolean> {
  const b = await getBirthday(userId);
  return !!b && isBirthdayOn(b.month, b.day, now);
}

/** Opted-in birthday of a handle, as the next occurrence — for scheduling a gift. */
export async function nextBirthdayForHandle(handle: string, now = new Date()) {
  const b = await prisma.userBirthday.findFirst({
    where: { user: { handle: { equals: handle.replace(/^@/, ''), mode: 'insensitive' } } },
    select: { month: true, day: true },
  });
  if (!b) return null;
  const { month, day } = b;
  return { month, day, next: nextBirthdayAt(month, day, now).toISOString() };
}

/**
 * Daily job: one notification to each follower of everyone whose birthday it is.
 * Each birthday row is claimed by a conditional update on `lastNotifiedYear`,
 * so a duplicate delivery of the job notifies nobody twice.
 */
export async function notifyTodaysBirthdays(now = new Date()): Promise<number> {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;
  const day = now.getUTCDate();
  // On Feb 28 of a non-leap year, Feb 29 birthdays are observed too.
  const days = month === 2 && day === 28 && observedDay(2, 29, year) === 28 ? [28, 29] : [day];
  const due = await prisma.userBirthday.findMany({
    where: {
      month,
      day: { in: days },
      OR: [{ lastNotifiedYear: null }, { lastNotifiedYear: { lt: year } }],
    },
    select: { userId: true },
    take: 500,
  });
  let notified = 0;
  for (const { userId } of due) {
    const claim = await prisma.userBirthday.updateMany({
      where: { userId, OR: [{ lastNotifiedYear: null }, { lastNotifiedYear: { lt: year } }] },
      data: { lastNotifiedYear: year },
    });
    if (claim.count === 0) continue;
    const [user, followers] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: userChipSelect,
      }),
      prisma.follow.findMany({
        where: { followingId: userId },
        select: { followerId: true },
        orderBy: { createdAt: 'desc' },
        take: BIRTHDAY_FOLLOWER_CAP,
      }),
    ]);
    if (!user) continue;
    const who = user.name ?? (user.handle ? `@${user.handle}` : 'Someone you follow');
    for (const { followerId } of followers) {
      await createNotification({
        userId: followerId,
        actorId: userId,
        type: 'SYSTEM',
        entityType: 'birthday',
        entityId: userId,
        preview: `It's ${who}'s birthday today. Say happy birthday!`,
        link: `/u/${user.handle ?? userId}`,
      }).catch(() => {});
      notified++;
    }
  }
  return notified;
}
