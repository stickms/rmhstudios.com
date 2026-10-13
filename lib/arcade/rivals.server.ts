import { prisma } from '@/lib/prisma.server';
import { cached } from '@/lib/cached.server';
import { games } from '@/lib/games';
import { getGameAdapter, adapterGameIds, type LeaderboardRow } from '@/lib/game/adapters.server';
import { createNotification } from '@/lib/notifications.server';
import { nextRivalState, type RivalState } from '@/lib/arcade/rivals';

const BOARD_SIZE = 100;
const NOTIFY_GAP_MS = 20 * 60 * 60 * 1000;

/** Top of a game's board via the shared adapter read path, cached for a minute. */
function boardFor(gameId: string): Promise<LeaderboardRow[]> {
  return cached(`arcade:rival-board:${gameId}`, 60_000, async () => {
    const adapter = getGameAdapter(gameId);
    return adapter ? adapter.leaderboard(BOARD_SIZE) : [];
  });
}

export const hasBoard = (gameId: string) => adapterGameIds().includes(gameId);

/** The caller's rival for a game: pinned on first lookup, then tracked by the daily job. */
export async function getRival(userId: string, gameId: string) {
  const adapter = getGameAdapter(gameId);
  if (!adapter) return null;
  const board = await boardFor(gameId);
  const idx = board.findIndex((r) => r.userId === userId);
  if (idx < 0) return { ranked: false as const };
  const lower = adapter.lowerIsBetter ?? false;
  const me = board[idx];

  let row = await prisma.arcadeRival.findUnique({ where: { userId_gameId: { userId, gameId } } });
  if (row) {
    const rivalRow = board.find((r) => r.userId === row!.rivalUserId);
    if (rivalRow) {
      const next = nextRivalState(row.state as RivalState, me.score, rivalRow.score, lower);
      if (next.state !== row.state) {
        row = await prisma.arcadeRival.update({
          where: { id: row.id },
          data: { state: next.state },
        });
      }
    }
  }
  // Re-pin to whoever is directly above while the current rival is still above.
  if ((!row || row.state === 'ahead') && idx > 0) {
    const above = board[idx - 1];
    if (above.userId && (!row || row.rivalUserId !== above.userId)) {
      row = await prisma.arcadeRival.upsert({
        where: { userId_gameId: { userId, gameId } },
        create: { userId, gameId, rivalUserId: above.userId, state: 'ahead' },
        update: { rivalUserId: above.userId, state: 'ahead' },
      });
    }
  }
  if (!row) return { ranked: true as const, rival: null, myScore: me.score, myRank: me.rank };
  const rivalRow = board.find((r) => r.userId === row!.rivalUserId);
  return {
    ranked: true as const,
    myScore: me.score,
    myRank: me.rank,
    state: row.state as RivalState,
    rival: rivalRow
      ? {
          userId: rivalRow.userId,
          name: rivalRow.username,
          score: rivalRow.score,
          rank: rivalRow.rank,
        }
      : null,
  };
}

/**
 * Daily batch: advance each rival's state from the cached boards and send at
 * most one notification per player (and none within ~a day of the last).
 */
export async function runRivalCheck(): Promise<number> {
  const events = new Map<string, { gameId: string; rivalUserId: string; rowId: string }[]>();
  let cursor: string | undefined;
  for (let page = 0; page < 20; page++) {
    const rows = await prisma.arcadeRival.findMany({
      take: 500,
      orderBy: { id: 'asc' },
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (rows.length === 0) break;
    cursor = rows[rows.length - 1].id;
    for (const r of rows) {
      const adapter = getGameAdapter(r.gameId);
      if (!adapter) continue;
      const board = await boardFor(r.gameId);
      const me = board.find((b) => b.userId === r.userId);
      const rival = board.find((b) => b.userId === r.rivalUserId);
      if (!me || !rival) continue;
      const next = nextRivalState(
        r.state as RivalState,
        me.score,
        rival.score,
        adapter.lowerIsBetter ?? false,
      );
      if (next.state !== r.state) {
        await prisma.arcadeRival.update({ where: { id: r.id }, data: { state: next.state } });
      }
      if (next.notify) {
        const list = events.get(r.userId) ?? [];
        list.push({ gameId: r.gameId, rivalUserId: r.rivalUserId, rowId: r.id });
        events.set(r.userId, list);
      }
    }
  }

  let sent = 0;
  const cutoff = new Date(Date.now() - NOTIFY_GAP_MS);
  for (const [userId, list] of events) {
    const recent = await prisma.arcadeRival.count({
      where: { userId, lastNotifiedAt: { gt: cutoff } },
    });
    if (recent > 0) continue;
    const first = list[0];
    const rivalName = (await getRivalName(first.gameId, first.rivalUserId)) ?? 'Your rival';
    const title = games.find((g) => g.id === first.gameId)?.title ?? first.gameId;
    await prisma.arcadeRival.updateMany({
      where: { id: { in: list.map((e) => e.rowId) } },
      data: { lastNotifiedAt: new Date() },
    });
    await createNotification({
      userId,
      type: 'SYSTEM',
      entityType: 'arcade-rival',
      entityId: first.gameId,
      preview:
        list.length > 1
          ? `${rivalName} and ${list.length - 1} more rival${list.length > 2 ? 's' : ''} just passed your best score.`
          : `${rivalName} just beat your best in ${title}.`,
      link: `/games/${first.gameId}`,
    });
    sent += 1;
  }
  return sent;
}

async function getRivalName(gameId: string, rivalUserId: string): Promise<string | null> {
  const board = await boardFor(gameId);
  return board.find((b) => b.userId === rivalUserId)?.username ?? null;
}
