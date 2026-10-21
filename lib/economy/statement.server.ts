/**
 * Monthly coin statement — server side (C4).
 *
 * Reads only. The summary is four grouped/aggregate queries over the existing
 * `(recipientId, createdAt)` and `(senderId, createdAt)` indexes; the CSV is a
 * single bounded scan. Both are scoped to the caller's own id by construction —
 * there is no parameter that names another member.
 *
 * ## Why closing balance is "now, minus what happened since"
 *
 * Summing the ledger from the start would reproduce the starting grant plus
 * every row, but legacy accounts carry permanent drift from spending that
 * predates the ledger (see `reconcileUser`). Walking backward from the stored
 * balance is exact for every account regardless of that history: the balance is
 * what the member actually has, and every later movement is subtracted out.
 */
import { prisma } from '@/lib/prisma.server';
import { apiCache } from '@/lib/cache';
import { userChipSelect } from '@/lib/user-display';
import {
  STATEMENT_CSV_MAX_ROWS,
  monthRange,
  summarize,
  type StatementCsvRow,
  type StatementSummary,
  type TypeTotal,
} from '@/lib/economy/statement';

const SUMMARY_TTL_MS = 60_000;
const summaryKey = (userId: string, month: string) => `statement:${userId}:${month}`;

export async function getStatementSummary(
  userId: string,
  month: string,
  now: Date = new Date(),
): Promise<StatementSummary | null> {
  const range = monthRange(month, now);
  if (!range) return null;

  const key = summaryKey(userId, month);
  const hit = apiCache.get<StatementSummary>(key);
  if (hit) return hit;

  const inRange = { gte: range.start, lt: range.end };
  const [credits, debits, creditsAfter, debitsAfter, profile] = await Promise.all([
    prisma.coinTransaction.groupBy({
      by: ['type'],
      where: { recipientId: userId, createdAt: inRange },
      _sum: { amount: true },
      _count: { _all: true },
    }),
    prisma.coinTransaction.groupBy({
      by: ['type'],
      where: { senderId: userId, createdAt: inRange },
      _sum: { amount: true },
      _count: { _all: true },
    }),
    prisma.coinTransaction.aggregate({
      where: { recipientId: userId, createdAt: { gte: range.end } },
      _sum: { amount: true },
    }),
    prisma.coinTransaction.aggregate({
      where: { senderId: userId, createdAt: { gte: range.end } },
      _sum: { amount: true },
    }),
    prisma.userProfile.findUnique({ where: { userId }, select: { coins: true } }),
  ]);

  const groups: TypeTotal[] = [
    ...credits.map((g) => ({
      type: g.type as string,
      direction: 'in' as const,
      total: Number(g._sum.amount ?? 0),
      count: g._count._all,
    })),
    ...debits.map((g) => ({
      type: g.type as string,
      direction: 'out' as const,
      total: Number(g._sum.amount ?? 0),
      count: g._count._all,
    })),
  ];

  const balanceNow = Number(profile?.coins ?? 0);
  const closing = balanceNow - (Number(creditsAfter._sum.amount ?? 0) - Number(debitsAfter._sum.amount ?? 0));
  const summary = summarize(month, groups, closing);

  apiCache.set(key, summary, SUMMARY_TTL_MS);
  return summary;
}

const HANDLE_CHUNK = 1000;

/** Every ledger row in the month as CSV rows, oldest first, capped. */
export async function getStatementCsvRows(
  userId: string,
  month: string,
  now: Date = new Date(),
): Promise<{ rows: StatementCsvRow[]; truncated: boolean } | null> {
  const range = monthRange(month, now);
  if (!range) return null;

  const rows = await prisma.coinTransaction.findMany({
    where: {
      createdAt: { gte: range.start, lt: range.end },
      OR: [{ recipientId: userId }, { senderId: userId }],
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    take: STATEMENT_CSV_MAX_ROWS + 1,
    select: {
      id: true,
      senderId: true,
      recipientId: true,
      amount: true,
      type: true,
      note: true,
      createdAt: true,
    },
  });
  const truncated = rows.length > STATEMENT_CSV_MAX_ROWS;
  const page = truncated ? rows.slice(0, STATEMENT_CSV_MAX_ROWS) : rows;

  const otherIds = new Set<string>();
  for (const r of page) {
    const other = r.recipientId === userId ? r.senderId : r.recipientId;
    if (other) otherIds.add(other);
  }
  const handles = new Map<string, string>();
  const ids = [...otherIds];
  for (let i = 0; i < ids.length; i += HANDLE_CHUNK) {
    const users = await prisma.user.findMany({
      where: { id: { in: ids.slice(i, i + HANDLE_CHUNK) } },
      select: userChipSelect,
    });
    for (const u of users) handles.set(u.id, u.handle ? `@${u.handle}` : (u.name ?? 'member'));
  }

  return {
    truncated,
    rows: page.map((r) => {
      const direction = r.recipientId === userId ? 'in' : 'out';
      const other = direction === 'in' ? r.senderId : r.recipientId;
      return {
        createdAt: r.createdAt,
        type: r.type,
        direction,
        amount: Number(r.amount),
        counterparty: other ? (handles.get(other) ?? 'deleted user') : 'RMH Studios',
        note: r.note,
        reference: r.id,
      };
    }),
  };
}
