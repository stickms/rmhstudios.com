/**
 * Who may be at a party's table (server-only).
 *
 * One rule for the party view, its sheets, its writes and the roll log: a viewer under a ban, or blocked in either
 * direction with the game master, is shut out. Every party read or write answers `null` / a 404 for them, the same as
 * for someone who was never in the party. `joinParty` applies the same two refusals when someone arrives.
 *
 * A block between two players hides each from the other inside the party (`hiddenFrom`): the other's line reads
 * "A player", with no summary or sheet state.
 */
import { prisma } from '@/lib/prisma.server';

/** The viewer may be at this party's table: not under a ban, and not blocked either way with its game master. */
export async function partyAccess(userId: string, party: { ownerId: string }): Promise<boolean> {
  const me = await prisma.user.findUnique({ where: { id: userId }, select: { bannedUntil: true } });
  if (!me || (me.bannedUntil && me.bannedUntil.getTime() > Date.now())) return false;
  if (party.ownerId === userId) return true;
  const block = await prisma.userBlock.findFirst({
    where: {
      OR: [
        { blockerId: userId, blockedId: party.ownerId },
        { blockerId: party.ownerId, blockedId: userId },
      ],
    },
    select: { id: true },
  });
  return !block;
}

/** Which of `others` the viewer is blocked with, in either direction (the viewer's own id is never hidden). */
export async function hiddenFrom(userId: string, others: readonly string[]): Promise<Set<string>> {
  const ids = [...new Set(others)].filter((id) => id !== userId);
  const out = new Set<string>();
  if (ids.length === 0) return out;
  const rows = await prisma.userBlock.findMany({
    where: {
      OR: [
        { blockerId: userId, blockedId: { in: ids } },
        { blockedId: userId, blockerId: { in: ids } },
      ],
    },
    select: { blockerId: true, blockedId: true },
  });
  if (!Array.isArray(rows)) return out;
  for (const r of rows) out.add(r.blockerId === userId ? r.blockedId : r.blockerId);
  return out;
}
