/**
 * Content warnings (sprint 06 #16) - server half of the reader preference. It lives on the member's profile row beside
 * the other content settings, so it is read with them and exported with them.
 */
import { prisma } from '@/lib/prisma.server';

export async function getShowContentWarnings(userId: string): Promise<boolean> {
  const row = await prisma.userProfile.findUnique({
    where: { userId },
    select: { showContentWarnings: true },
  });
  return row?.showContentWarnings ?? false;
}

/** Set the preference for `userId` alone (the profile row is created on first use). */
export async function setShowContentWarnings(userId: string, value: boolean): Promise<boolean> {
  const row = await prisma.userProfile.upsert({
    where: { userId },
    create: { userId, showContentWarnings: value },
    update: { showContentWarnings: value },
    select: { showContentWarnings: true },
  });
  return row.showContentWarnings;
}
