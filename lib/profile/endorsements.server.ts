/**
 * Server half of skill endorsements (P8). Server-only.
 *
 * A member vouches for a fixed skill (`lib/profile/skills.ts`) on someone
 * else's profile — one endorsement per endorser per skill per member, enforced
 * by the table's composite key. Counts are shown on the profile; they are
 * deliberately unweighted (see the report: weighting by the endorser's own work
 * in that area needs a skill->activity mapping that does not exist yet).
 *
 * A profile only accepts endorsements while its owner has the "Skills" module
 * in their showcase — adding the module is the opt-in, removing it the opt-out.
 */
import { prisma } from '@/lib/prisma.server';
import { parseLayout } from '@/lib/profile/modules';
import { isSkillId } from '@/lib/profile/skills';
import { DELETED_ACCOUNT_BAN_REASON } from '@/lib/account-lifecycle';

export interface EndorsementView {
  /** skill id -> number of endorsers, only skills with at least one. */
  counts: Record<string, number>;
  /** skill ids the viewer has endorsed on this profile. */
  mine: string[];
  /** The profile's owner accepts endorsements (has the Skills module). */
  open: boolean;
}

async function acceptsEndorsements(targetId: string): Promise<boolean> {
  const row = await prisma.profileLayout.findUnique({
    where: { userId: targetId },
    select: { modules: true },
  });
  return parseLayout(row?.modules).some((m) => m.kind === 'endorsements');
}

export async function getEndorsements(
  targetId: string,
  viewerId: string | null,
): Promise<EndorsementView> {
  const [groups, mine, open] = await Promise.all([
    prisma.skillEndorsement.groupBy({
      by: ['skill'],
      where: { targetId },
      _count: { _all: true },
    }),
    viewerId
      ? prisma.skillEndorsement.findMany({
          where: { targetId, endorserId: viewerId },
          select: { skill: true },
          take: 64,
        })
      : Promise.resolve([]),
    acceptsEndorsements(targetId),
  ]);
  const counts: Record<string, number> = {};
  for (const g of groups) if (isSkillId(g.skill)) counts[g.skill] = g._count._all;
  return { counts, mine: mine.map((m) => m.skill), open };
}

export type EndorseResult = { ok: true } | { ok: false; status: number; error: string };

export async function setEndorsement(
  endorserId: string,
  targetId: string,
  skill: string,
  on: boolean,
): Promise<EndorseResult> {
  if (!isSkillId(skill)) return { ok: false, status: 400, error: 'Unknown skill.' };
  if (endorserId === targetId) {
    return { ok: false, status: 400, error: "You can't endorse yourself." };
  }

  if (!on) {
    await prisma.skillEndorsement.deleteMany({ where: { endorserId, targetId, skill } });
    return { ok: true };
  }

  const [target, blocked, open] = await Promise.all([
    prisma.user.findUnique({
      where: { id: targetId },
      select: { id: true, banReason: true, deletionScheduledAt: true },
    }),
    prisma.userBlock.findFirst({
      where: {
        OR: [
          { blockerId: endorserId, blockedId: targetId },
          { blockerId: targetId, blockedId: endorserId },
        ],
      },
      select: { id: true },
    }),
    acceptsEndorsements(targetId),
  ]);
  if (
    !target ||
    target.banReason === DELETED_ACCOUNT_BAN_REASON ||
    target.deletionScheduledAt ||
    blocked
  ) {
    return { ok: false, status: 404, error: 'Member not found.' };
  }
  if (!open) {
    return { ok: false, status: 403, error: 'This member is not accepting endorsements.' };
  }
  await prisma.skillEndorsement.createMany({
    data: [{ endorserId, targetId, skill }],
    skipDuplicates: true,
  });
  return { ok: true };
}
