/**
 * "Where your XP came from" (sprint 14 05), server side. Only the signed-in member's own ledger is read: the ledger
 * has no `userId`, so the member's `DoctrineReputation.id` is read first (unique on `userId`) and every ledger read
 * is by `reputationId`, which `[reputationId, createdAt desc]` indexes. `reason` and `metadata` are never selected.
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma.server';
import {
  EXPORT_ROW_LIMIT,
  HEATMAP_WEEKS,
  LEDGER_PAGE_SIZE,
  SUMMARY_DAYS,
  WINDOW_ROW_LIMIT,
  bucketDays,
  decodeLedgerCursor,
  encodeLedgerCursor,
  summarize,
  type ActivityDays,
  type LedgerCursor,
  type LedgerPage,
  type LedgerSummary,
} from './ledger';

const DAY_MS = 86_400_000;

/** A bad cursor token: the endpoint answers 400. */
export class LedgerCursorError extends Error {
  constructor() {
    super('invalid cursor');
    this.name = 'LedgerCursorError';
  }
}

async function reputationIdOf(userId: string): Promise<string | null> {
  const rep = await prisma.doctrineReputation.findUnique({ where: { userId }, select: { id: true } });
  return rep && typeof rep.id === 'string' ? rep.id : null;
}

const EMPTY_SUMMARY: LedgerSummary = { gained: 0, lost: 0, byAction: [] };

/** The last 30 days of the member's ledger, by action. */
export async function ledgerSummary(userId: string, now: Date = new Date()): Promise<LedgerSummary> {
  const reputationId = await reputationIdOf(userId);
  if (!reputationId) return EMPTY_SUMMARY;
  const rows = await prisma.doctrineReputationLedger.findMany({
    where: { reputationId, createdAt: { gte: new Date(now.getTime() - SUMMARY_DAYS * DAY_MS) } },
    orderBy: { createdAt: 'desc' },
    select: { action: true, xpDelta: true },
    take: WINDOW_ROW_LIMIT,
  });
  return summarize(Array.isArray(rows) ? rows : []);
}

/** One page of the member's ledger, newest first, keyset-paged on `(createdAt, id)`; the first page carries the summary. */
export async function listLedger(userId: string, token?: string, now: Date = new Date()): Promise<LedgerPage> {
  let cursor: LedgerCursor | null = null;
  if (token) {
    cursor = decodeLedgerCursor(token);
    if (!cursor) throw new LedgerCursorError();
  }
  const reputationId = await reputationIdOf(userId);
  if (!reputationId) return { rows: [], nextCursor: null, summary: cursor ? null : EMPTY_SUMMARY };
  const where = {
    reputationId,
    ...(cursor ? { OR: [{ createdAt: { lt: cursor.at } }, { createdAt: cursor.at, id: { lt: cursor.id } }] } : {}),
  } satisfies Prisma.DoctrineReputationLedgerWhereInput;
  const found = await prisma.doctrineReputationLedger.findMany({
    where,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: LEDGER_PAGE_SIZE + 1,
    select: { id: true, action: true, xpDelta: true, createdAt: true },
  });
  const rows = Array.isArray(found) ? found : [];
  const page = rows.slice(0, LEDGER_PAGE_SIZE);
  const last = page[page.length - 1];
  return {
    rows: page.map((r) => ({ id: r.id, action: r.action, xpDelta: r.xpDelta, at: r.createdAt.toISOString() })),
    nextCursor: rows.length > LEDGER_PAGE_SIZE && last ? encodeLedgerCursor({ at: last.createdAt, id: last.id }) : null,
    summary: cursor ? null : await ledgerSummary(userId, now),
  };
}

/** Days the member earned XP in the last 16 weeks, in the zone the page reports (UTC when it is not a real zone). */
export async function activityDays(userId: string, now: Date, tz: string | undefined): Promise<ActivityDays> {
  const reputationId = await reputationIdOf(userId);
  if (!reputationId) return { days: {} };
  // One day of slack each side, so a zone ahead of or behind UTC still sees its first day.
  const since = new Date(now.getTime() - (HEATMAP_WEEKS * 7 + 1) * DAY_MS);
  const rows = await prisma.doctrineReputationLedger.findMany({
    where: { reputationId, xpDelta: { gt: 0 }, createdAt: { gte: since } },
    orderBy: { createdAt: 'desc' },
    select: { xpDelta: true, createdAt: true },
    take: WINDOW_ROW_LIMIT,
  });
  return { days: bucketDays(Array.isArray(rows) ? rows : [], tz) };
}

export interface DoctrineReputationExport {
  totalXp: number;
  currentStreak: number;
  longestStreak: number;
  sahurCount: number;
  coalitionScore: number;
  lastActiveAt: string | null;
  ledger: { action: string; xpDelta: number; at: string }[];
}

/** The member's reputation and ledger (action, change and date; at most 5,000 rows) for the data export. */
export async function exportDoctrineReputation(userId: string): Promise<DoctrineReputationExport> {
  const rep = await prisma.doctrineReputation.findUnique({
    where: { userId },
    select: {
      id: true,
      totalXp: true,
      currentStreak: true,
      longestStreak: true,
      sahurCount: true,
      coalitionScore: true,
      lastActiveAt: true,
    },
  });
  if (!rep || typeof rep.id !== 'string') {
    return {
      totalXp: 0,
      currentStreak: 0,
      longestStreak: 0,
      sahurCount: 0,
      coalitionScore: 1,
      lastActiveAt: null,
      ledger: [],
    };
  }
  const rows = await prisma.doctrineReputationLedger.findMany({
    where: { reputationId: rep.id },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: EXPORT_ROW_LIMIT,
    select: { action: true, xpDelta: true, createdAt: true },
  });
  return {
    totalXp: rep.totalXp,
    currentStreak: rep.currentStreak,
    longestStreak: rep.longestStreak,
    sahurCount: rep.sahurCount,
    coalitionScore: rep.coalitionScore,
    lastActiveAt: rep.lastActiveAt.toISOString(),
    ledger: (Array.isArray(rows) ? rows : []).map((r) => ({
      action: r.action,
      xpDelta: r.xpDelta,
      at: r.createdAt.toISOString(),
    })),
  };
}
