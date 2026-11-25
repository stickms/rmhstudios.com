import { beforeEach, describe, expect, it, vi } from 'vitest';
import { assertJsonSafe } from '@/lib/db/query-shape';

/**
 * The member's XP ledger over a small in-memory Doctrine database: own rows only, no `reason` or `metadata` in any
 * response, keyset paging on (createdAt, id) that never skips or repeats a row across equal timestamps, and the
 * heatmap read. The fake is wrapped in `shapeChecked`, so a query Postgres would reject fails here too.
 */

interface RepRow {
  id: string;
  userId: string;
  totalXp: number;
  currentStreak: number;
  longestStreak: number;
  sahurCount: number;
  coalitionScore: number;
  lastActiveAt: Date;
}
interface LedgerRow {
  id: string;
  reputationId: string;
  action: string;
  xpDelta: number;
  reason: string;
  metadata: unknown;
  createdAt: Date;
}
type Where = {
  reputationId: string;
  xpDelta?: { gt: number };
  createdAt?: { gte: Date };
  OR?: Array<{ createdAt: { lt: Date } } | { createdAt: Date; id: { lt: string } }>;
};

const db = vi.hoisted(() => ({
  reps: [] as RepRow[],
  ledger: [] as LedgerRow[],
  selects: [] as Array<Record<string, boolean>>,
}));

vi.mock('@/lib/prisma.server', async () => {
  const { shapeChecked } = await import('@/lib/db/query-shape');
  return {
    prisma: shapeChecked({
      doctrineReputation: {
        findUnique: async (args: { where: { userId: string }; select: Record<string, boolean> }) => {
          const row = db.reps.find((r) => r.userId === args.where.userId);
          if (!row) return null;
          return Object.fromEntries(Object.entries(row).filter(([k]) => args.select[k]));
        },
      },
      doctrineReputationLedger: {
        findMany: async (args: { where: Where; take: number; orderBy?: unknown; select: Record<string, boolean> }) => {
          db.selects.push(args.select);
          const w = args.where;
          const rows = db.ledger
            .filter((r) => r.reputationId === w.reputationId)
            .filter((r) => !w.xpDelta || r.xpDelta > w.xpDelta.gt)
            .filter((r) => !w.createdAt || r.createdAt.getTime() >= w.createdAt.gte.getTime())
            .filter(
              (r) =>
                !w.OR ||
                w.OR.some((c) =>
                  'id' in c
                    ? r.createdAt.getTime() === c.createdAt.getTime() && r.id < c.id.lt
                    : r.createdAt.getTime() < c.createdAt.lt.getTime(),
                ),
            )
            .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || (a.id < b.id ? 1 : -1))
            .slice(0, args.take);
          return rows.map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => args.select[k])));
        },
      },
    }),
  };
});

const { listLedger, ledgerSummary, activityDays, exportDoctrineReputation, LedgerCursorError } =
  await import('../ledger.server');

const NOW = new Date('2026-11-25T12:00:00.000Z');
const DAY = 86_400_000;
let seq = 0;

function rep(userId: string, id = `rep-${userId}`) {
  db.reps.push({
    id,
    userId,
    totalXp: 120,
    currentStreak: 3,
    longestStreak: 9,
    sahurCount: 1,
    coalitionScore: 1.5,
    lastActiveAt: NOW,
  });
}

function entry(userId: string, action: string, xpDelta: number, at: Date, id?: string) {
  db.ledger.push({
    id: id ?? `l${String(++seq).padStart(4, '0')}`,
    reputationId: `rep-${userId}`,
    action,
    xpDelta,
    reason: `${action} ${xpDelta}XP`,
    metadata: { puzzleId: 'secret-puzzle-id' },
    createdAt: at,
  });
}

beforeEach(() => {
  db.reps.length = 0;
  db.ledger.length = 0;
  db.selects.length = 0;
  seq = 0;
  rep('me');
  rep('other');
});

describe('listLedger', () => {
  it('returns only the member’s own rows, newest first, with no reason or metadata', async () => {
    entry('me', 'PUZZLE_SOLVE', 10, new Date(NOW.getTime() - 2 * DAY));
    entry('me', 'WEEKLY_DECAY', -6, new Date(NOW.getTime() - DAY));
    entry('other', 'PUZZLE_FIRST_SOLVE', 50, new Date(NOW.getTime() - DAY));
    const page = await listLedger('me', undefined, NOW);
    assertJsonSafe(page);
    expect(page.rows.map((r) => [r.action, r.xpDelta])).toEqual([
      ['WEEKLY_DECAY', -6],
      ['PUZZLE_SOLVE', 10],
    ]);
    expect(page.nextCursor).toBeNull();
    expect(Object.keys(page.rows[0] ?? {}).sort()).toEqual(['action', 'at', 'id', 'xpDelta']);
    const body = JSON.stringify(page);
    expect(body).not.toContain('secret-puzzle-id');
    expect(body).not.toContain('XP"');
    for (const select of db.selects) {
      expect(select.reason).toBeUndefined();
      expect(select.metadata).toBeUndefined();
    }
  });

  it('gives the 30-day summary on the first page only', async () => {
    entry('me', 'PUZZLE_SOLVE', 10, new Date(NOW.getTime() - DAY));
    entry('me', 'WEEKLY_DECAY', -4, new Date(NOW.getTime() - 2 * DAY));
    entry('me', 'PUZZLE_SOLVE', 10, new Date(NOW.getTime() - 40 * DAY));
    const first = await listLedger('me', undefined, NOW);
    expect(first.summary).toEqual({
      gained: 10,
      lost: 4,
      byAction: [
        { action: 'PUZZLE_SOLVE', xp: 10 },
        { action: 'WEEKLY_DECAY', xp: -4 },
      ],
    });
  });

  it('pages stably across equal timestamps: every row once, in order', async () => {
    const same = new Date(NOW.getTime() - DAY);
    for (let i = 0; i < 70; i++) entry('me', 'PUZZLE_SOLVE', 10, same);
    entry('me', 'PUZZLE_FIRST_SOLVE', 50, new Date(NOW.getTime() - 3 * DAY));
    const seen: string[] = [];
    let token: string | undefined;
    let pages = 0;
    do {
      const page = await listLedger('me', token, NOW);
      expect(page.summary === null).toBe(token !== undefined);
      expect(page.rows.length).toBeLessThanOrEqual(30);
      seen.push(...page.rows.map((r) => r.id));
      token = page.nextCursor ?? undefined;
      pages++;
    } while (token && pages < 10);
    expect(pages).toBe(3);
    expect(seen).toHaveLength(71);
    expect(new Set(seen).size).toBe(71);
    const ids = db.ledger.filter((r) => r.createdAt.getTime() === same.getTime()).map((r) => r.id);
    expect(seen.slice(0, 70)).toEqual([...ids].sort().reverse());
  });

  it('refuses a cursor that is not one', async () => {
    await expect(listLedger('me', '!!!', NOW)).rejects.toBeInstanceOf(LedgerCursorError);
  });

  it('is empty for a member with no reputation row, and never reads another member’s', async () => {
    entry('other', 'PUZZLE_SOLVE', 10, NOW);
    const page = await listLedger('nobody', undefined, NOW);
    expect(page).toEqual({ rows: [], nextCursor: null, summary: { gained: 0, lost: 0, byAction: [] } });
  });
});

describe('ledgerSummary', () => {
  it('covers 30 days and no more', async () => {
    entry('me', 'PUZZLE_SOLVE', 10, new Date(NOW.getTime() - 29 * DAY));
    entry('me', 'PUZZLE_SOLVE', 10, new Date(NOW.getTime() - 31 * DAY));
    expect((await ledgerSummary('me', NOW)).gained).toBe(10);
  });
});

describe('activityDays', () => {
  it('counts earning rows per local day, own rows, last 16 weeks only', async () => {
    entry('me', 'PUZZLE_SOLVE', 10, new Date('2026-11-20T23:30:00Z'));
    entry('me', 'PUZZLE_REPLAY_SOLVE', 3, new Date('2026-11-20T01:00:00Z'));
    entry('me', 'WEEKLY_DECAY', -5, new Date('2026-11-21T01:00:00Z'));
    entry('other', 'PUZZLE_SOLVE', 10, new Date('2026-11-20T10:00:00Z'));
    entry('me', 'PUZZLE_SOLVE', 10, new Date(NOW.getTime() - 200 * DAY));
    const utc = await activityDays('me', NOW, 'UTC');
    assertJsonSafe(utc);
    expect(utc.days).toEqual({ '2026-11-20': 2 });
    expect((await activityDays('me', NOW, 'Asia/Tokyo')).days).toEqual({ '2026-11-20': 1, '2026-11-21': 1 });
    expect((await activityDays('me', NOW, 'Bad/Zone')).days).toEqual({ '2026-11-20': 2 });
    expect((await activityDays('nobody', NOW, 'UTC')).days).toEqual({});
  });
});

describe('exportDoctrineReputation', () => {
  it('carries totals and the ledger’s action, change and date only', async () => {
    entry('me', 'PUZZLE_SOLVE', 10, new Date('2026-11-20T10:00:00Z'));
    entry('other', 'PUZZLE_SOLVE', 99, new Date('2026-11-20T10:00:00Z'));
    const out = await exportDoctrineReputation('me');
    assertJsonSafe(out);
    expect(out.totalXp).toBe(120);
    expect(out.longestStreak).toBe(9);
    expect(out.ledger).toEqual([{ action: 'PUZZLE_SOLVE', xpDelta: 10, at: '2026-11-20T10:00:00.000Z' }]);
    expect(JSON.stringify(out)).not.toContain('secret-puzzle-id');
  });

  it('is zeros and an empty ledger for a member who never earned XP', async () => {
    const out = await exportDoctrineReputation('nobody');
    expect(out.totalXp).toBe(0);
    expect(out.ledger).toEqual([]);
  });
});
