import { prisma } from '@/lib/prisma.server';
import { resolveUser, userDisplaySelect } from '@/lib/user-display';
import type { CalPerson } from './types';

export function toCalPerson(user: Parameters<typeof resolveUser>[0]): CalPerson {
  const r = resolveUser(user);
  return { id: r.id, name: r.name, handle: r.handle, image: r.image };
}

/** Batch-load display shapes for a set of user ids (one query). */
export async function loadPeople(ids: readonly string[]): Promise<Map<string, CalPerson>> {
  const unique = [...new Set(ids)];
  const out = new Map<string, CalPerson>();
  if (unique.length === 0) return out;
  const rows = await prisma.user.findMany({
    where: { id: { in: unique } },
    select: userDisplaySelect,
    take: unique.length,
  });
  for (const r of rows) out.set(r.id, toCalPerson(r));
  return out;
}

/** Ids of users the pair has blocked in either direction. */
export async function blockedBetween(a: string, b: string): Promise<boolean> {
  const hit = await prisma.userBlock.findFirst({
    where: {
      OR: [
        { blockerId: a, blockedId: b },
        { blockerId: b, blockedId: a },
      ],
    },
    select: { id: true },
  });
  return !!hit;
}
