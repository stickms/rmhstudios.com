/** Kudos (G4) — server side. No coins move: this is recognition only. */
import { prisma } from '@/lib/prisma.server';
import { createNotification } from '@/lib/notifications.server';
import { userChipSelect } from '@/lib/user-display';
import { KUDOS_PAGE, type KudosPage } from '@/lib/gifting/kudos';

const startOfUtcDay = (d = new Date()) =>
  new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

async function eitherBlocked(a: string, b: string): Promise<boolean> {
  const row = await prisma.userBlock.findFirst({
    where: {
      OR: [
        { blockerId: a, blockedId: b },
        { blockerId: b, blockedId: a },
      ],
    },
    select: { id: true },
  });
  return !!row;
}

export async function readKudos(
  ownerId: string,
  viewerId: string | null,
  cursor: string | null,
): Promise<KudosPage | null> {
  const owner = await prisma.user.findUnique({ where: { id: ownerId }, select: { id: true } });
  if (!owner) return null;
  const [rows, total, givenToday, blocked] = await Promise.all([
    prisma.kudos.findMany({
      where: { toId: ownerId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: KUDOS_PAGE + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true,
        reason: true,
        createdAt: true,
        from: { select: userChipSelect },
      },
    }),
    cursor ? Promise.resolve(0) : prisma.kudos.count({ where: { toId: ownerId } }),
    viewerId && viewerId !== ownerId
      ? prisma.kudos.count({
          where: { fromId: viewerId, toId: ownerId, createdAt: { gte: startOfUtcDay() } },
        })
      : Promise.resolve(0),
    viewerId && viewerId !== ownerId ? eitherBlocked(viewerId, ownerId) : Promise.resolve(false),
  ]);
  const page = rows.slice(0, KUDOS_PAGE);
  return {
    kudos: page.map((k) => ({
      id: k.id,
      reason: k.reason,
      createdAt: k.createdAt.toISOString(),
      from: k.from,
    })),
    nextCursor: rows.length > KUDOS_PAGE ? page[page.length - 1]!.id : null,
    total,
    canGive: !!viewerId && viewerId !== ownerId && givenToday === 0 && !blocked,
  };
}

export type GiveKudosResult =
  { ok: true; id: string } | { ok: false; status: number; error: string };

export async function giveKudos(
  fromId: string,
  toId: string,
  reason: string,
): Promise<GiveKudosResult> {
  if (fromId === toId) return { ok: false, status: 400, error: 'You cannot give yourself kudos' };
  const to = await prisma.user.findUnique({ where: { id: toId }, select: { id: true } });
  if (!to) return { ok: false, status: 404, error: 'Not found' };
  if (await eitherBlocked(fromId, toId)) return { ok: false, status: 403, error: 'Not allowed' };
  const today = await prisma.kudos.count({
    where: { fromId, toId, createdAt: { gte: startOfUtcDay() } },
  });
  if (today > 0) return { ok: false, status: 429, error: 'You already gave them kudos today' };

  const row = await prisma.kudos.create({ data: { fromId, toId, reason }, select: { id: true } });
  await createNotification({
    userId: toId,
    actorId: fromId,
    type: 'SYSTEM',
    entityType: 'kudos',
    entityId: row.id,
    preview: `Kudos: ${reason.slice(0, 100)}`,
    link: `/u/${toId}`,
  }).catch(() => {});
  return { ok: true, id: row.id };
}

/** Recipient or sender may remove a note. */
export async function deleteKudos(userId: string, id: string): Promise<boolean> {
  const res = await prisma.kudos.deleteMany({
    where: { id, OR: [{ toId: userId }, { fromId: userId }] },
  });
  return res.count > 0;
}
