import { prisma } from '@/lib/prisma.server';
import { resolveUser, userDisplaySelect } from '@/lib/user-display';
import { pickPoints, validatePicks, type PickInput, type PickRole } from './pickem';

const LEADERBOARD_SIZE = 20;
/** Bounds the scoring read: a pick'em card is at most 4 rows per member. */
const PICK_SCAN_CAP = 8000;

export async function getPickem(tournamentId: string, viewerId: string | null) {
  const t = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    select: { format: true, status: true },
  });
  if (!t || t.format !== 'SINGLE_ELIM') return null;
  const complete = t.status === 'COMPLETE';

  const picks = await prisma.bracketPick.findMany({
    where: { tournamentId },
    take: PICK_SCAN_CAP,
    select: {
      userId: true,
      role: true,
      entrantId: true,
      entrant: { select: { placement: true } },
    },
  });
  const byUser = new Map<string, number>();
  for (const p of picks) {
    byUser.set(
      p.userId,
      (byUser.get(p.userId) ?? 0) +
        (complete ? pickPoints(p.role as PickRole, p.entrant.placement) : 0),
    );
  }
  const top = [...byUser.entries()].sort((a, b) => b[1] - a[1]).slice(0, LEADERBOARD_SIZE);
  const users = await prisma.user.findMany({
    where: { id: { in: top.map(([id]) => id) } },
    select: userDisplaySelect,
  });
  const userById = new Map(users.map((u) => [u.id, u]));

  return {
    open: t.status === 'REGISTRATION',
    complete,
    pickerCount: byUser.size,
    mine: picks
      .filter((p) => p.userId === viewerId)
      .map((p) => ({ role: p.role as PickRole, entrantId: p.entrantId })),
    leaderboard: complete
      ? top.map(([id, points]) => ({
          user: userById.get(id) ? resolveUser(userById.get(id)!) : null,
          points,
        }))
      : [],
  };
}

export type SetPicksResult = { ok: true } | { ok: false; error: string; status: number };

/** Replace the member's card. Only while registration is open (before the bracket exists). */
export async function setPicks(
  tournamentId: string,
  userId: string,
  picks: PickInput[],
): Promise<SetPicksResult> {
  const bad = validatePicks(picks);
  if (bad) return { ok: false, error: bad, status: 400 };
  return prisma.$transaction(async (tx) => {
    const t = await tx.tournament.findUnique({
      where: { id: tournamentId },
      select: { format: true, status: true },
    });
    if (!t || t.format !== 'SINGLE_ELIM')
      return { ok: false, error: 'No pick’em here', status: 404 };
    if (t.status !== 'REGISTRATION') return { ok: false, error: 'Picks are locked', status: 409 };
    const valid = await tx.tournamentEntrant.count({
      where: { tournamentId, id: { in: picks.map((p) => p.entrantId) } },
    });
    if (valid !== picks.length) return { ok: false, error: 'Unknown entrant', status: 400 };
    await tx.bracketPick.deleteMany({ where: { tournamentId, userId } });
    if (picks.length > 0) {
      await tx.bracketPick.createMany({
        data: picks.map((p) => ({ tournamentId, userId, entrantId: p.entrantId, role: p.role })),
      });
    }
    return { ok: true };
  });
}
