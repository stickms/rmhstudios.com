/** Friends-league persistence and views. Server-only. */

import { randomInt } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma.server';
import { resolveUser, userDisplaySelect } from '@/lib/user-display';
import {
  MAX_LEAGUES_PER_USER,
  MAX_MEMBERS,
  isLocked,
  leaderboard,
  leagueLockAt,
  sanitizePicks,
  type LeagueListItem,
  type LeagueMemberRow,
  type LeagueView,
} from './leagues';
import { compactKeys, type Picks } from './predict';
import { generateRoomCode } from './rooms';
import { parseDay } from './calendar';
import { getElectionSnapshot } from './source.server';

type Result<T> = ({ ok: true } & T) | { ok: false; status: number; error: string };

const display = (u: Prisma.UserGetPayload<{ select: typeof userDisplaySelect }> | null) => {
  const r = u ? resolveUser(u) : null;
  return { name: r?.name ?? r?.username ?? null, handle: r?.handle ?? null, image: r?.image ?? null };
};

export async function createLeague(userId: string, input: { name: string; cycle: string }): Promise<Result<{ code: string }>> {
  const cycle = parseDay(input.cycle);
  if (!cycle) return { ok: false, status: 422, error: 'Unknown election.' };
  const owned = await prisma.electionLeague.count({ where: { ownerId: userId } });
  if (owned >= MAX_LEAGUES_PER_USER) {
    return { ok: false, status: 429, error: `You can own ${MAX_LEAGUES_PER_USER} leagues. Delete one first.` };
  }
  const label = cycle.kind === 'other' ? cycle.date : String(cycle.year);
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateRoomCode((max) => randomInt(max));
    try {
      await prisma.electionLeague.create({
        data: { code, name: input.name, cycle: label, ownerId: userId, members: { create: { userId } } },
      });
      return { ok: true, code };
    } catch (err) {
      if ((err as { code?: string })?.code !== 'P2002') throw err;
    }
  }
  return { ok: false, status: 503, error: 'Could not create the league. Try again.' };
}

export async function listMyLeagues(userId: string): Promise<LeagueListItem[]> {
  const rows = await prisma.electionLeague.findMany({
    where: { members: { some: { userId } } },
    orderBy: { createdAt: 'desc' },
    take: 30,
    select: { code: true, name: true, cycle: true, ownerId: true, _count: { select: { members: true } } },
  });
  return rows.map((r) => ({ code: r.code, name: r.name, cycle: r.cycle, memberCount: r._count.members, isOwner: r.ownerId === userId }));
}

/** The league as the viewer may see it: anyone with the code sees its name; members also see the board. */
export async function getLeagueView(code: string, viewerId: string | null): Promise<LeagueView | null> {
  const row = await prisma.electionLeague.findUnique({
    where: { code },
    include: {
      owner: { select: userDisplaySelect },
      members: { include: { user: { select: userDisplaySelect } }, orderBy: { joinedAt: 'asc' } },
    },
  });
  if (!row) return null;
  const mine = viewerId ? row.members.find((m) => m.userId === viewerId) : undefined;
  const lock = leagueLockAt(row.cycle);
  const base = {
    code: row.code,
    name: row.name,
    cycle: row.cycle,
    owner: row.owner ? { id: row.ownerId, name: display(row.owner).name } : null,
    joined: !!mine,
    isOwner: viewerId != null && row.ownerId === viewerId,
    memberCount: row.members.length,
    lockAt: lock ? lock.toISOString() : null,
    locked: isLocked(row.cycle),
  };
  if (!mine) return { ...base, standings: [], myPicks: null };

  const cycle = parseDay(row.cycle);
  const snapshot = cycle ? await getElectionSnapshot(cycle) : null;
  const valid = snapshot ? new Set(compactKeys(snapshot.races)) : undefined;
  const members: LeagueMemberRow[] = row.members.map((m) => ({
    userId: m.userId,
    ...display(m.user),
    picks: sanitizePicks(m.picks, valid),
    pickedAt: m.pickedAt ? m.pickedAt.toISOString() : null,
  }));
  return { ...base, standings: leaderboard(members, snapshot?.races ?? []), myPicks: members.find((m) => m.userId === viewerId)?.picks ?? {} };
}

export async function joinLeague(code: string, userId: string): Promise<Result<object>> {
  const league = await prisma.electionLeague.findUnique({ where: { code }, select: { id: true, _count: { select: { members: true } } } });
  if (!league) return { ok: false, status: 404, error: 'League not found.' };
  const already = await prisma.electionLeagueMember.findUnique({ where: { leagueId_userId: { leagueId: league.id, userId } }, select: { id: true } });
  if (already) return { ok: true };
  if (league._count.members >= MAX_MEMBERS) return { ok: false, status: 409, error: 'That league is full.' };
  try {
    await prisma.electionLeagueMember.create({ data: { leagueId: league.id, userId } });
  } catch (err) {
    if ((err as { code?: string })?.code !== 'P2002') throw err; // a double-tap: already a member
  }
  return { ok: true };
}

export async function leaveLeague(code: string, userId: string): Promise<Result<object>> {
  const league = await prisma.electionLeague.findUnique({ where: { code }, select: { id: true, ownerId: true } });
  if (!league) return { ok: false, status: 404, error: 'League not found.' };
  if (league.ownerId === userId) {
    await prisma.electionLeague.delete({ where: { id: league.id } }); // the owner leaving closes the league
    return { ok: true };
  }
  await prisma.electionLeagueMember.deleteMany({ where: { leagueId: league.id, userId } });
  return { ok: true };
}

export async function savePicks(code: string, userId: string, raw: unknown, now = new Date()): Promise<Result<{ saved: number }>> {
  const league = await prisma.electionLeague.findUnique({ where: { code }, select: { id: true, cycle: true } });
  if (!league) return { ok: false, status: 404, error: 'League not found.' };
  if (isLocked(league.cycle, now)) return { ok: false, status: 423, error: 'Maps are locked: the first polls have closed.' };
  const member = await prisma.electionLeagueMember.findUnique({ where: { leagueId_userId: { leagueId: league.id, userId } }, select: { id: true } });
  if (!member) return { ok: false, status: 403, error: 'Join the league first.' };
  const cycle = parseDay(league.cycle);
  const snapshot = cycle ? await getElectionSnapshot(cycle) : null;
  const picks: Picks = sanitizePicks(raw, snapshot ? new Set(compactKeys(snapshot.races)) : undefined);
  await prisma.electionLeagueMember.update({
    where: { id: member.id },
    data: { picks: picks as unknown as Prisma.InputJsonValue, pickedAt: now },
  });
  return { ok: true, saved: Object.keys(picks).length };
}
