import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * "Your runs" reads (sprint 13 03) against an in-memory fake of the three tables: only the caller's rows, open runs
 * left out, a refusal in its code, an unparsable result as status only, teammates by current name (blocked: "A player",
 * erased: "Deleted user"), and a cursor that pages without a gap or a repeat.
 */

type Row = Record<string, unknown>;
const h = vi.hoisted(() => ({
  solo: [] as Array<Record<string, unknown>>,
  players: [] as Array<Record<string, unknown>>,
  blocks: [] as Array<{ blockerId: string; blockedId: string }>,
  soloFindMany: undefined as undefined | ((args: Record<string, unknown>) => unknown),
}));

type Where = {
  userId?: string;
  status?: { in: string[] };
  OR?: Array<Record<string, unknown>>;
};

function matches(row: Row, where: Where, timeKey: string): boolean {
  if (where.userId !== undefined && row.userId !== where.userId) return false;
  if (where.status && !where.status.in.includes(row.status as string)) return false;
  if (where.OR) {
    const t = (row[timeKey] as Date).getTime();
    return where.OR.some((clause) => {
      const c = clause[timeKey] as { lt?: Date } | Date;
      if (c instanceof Date) return t === c.getTime() && (row.id as string) < (clause.id as { lt: string }).lt;
      return t < (c.lt as Date).getTime();
    });
  }
  return true;
}

function sorted(rows: Row[], timeKey: string): Row[] {
  return [...rows].sort((a, b) => {
    const d = (b[timeKey] as Date).getTime() - (a[timeKey] as Date).getTime();
    return d !== 0 ? d : String(b.id).localeCompare(String(a.id));
  });
}

vi.mock('@/lib/prisma.server', () => ({
  prisma: {
    altairSoloRun: {
      findMany: vi.fn(async (args: { where: Where; take: number }) =>
        sorted(
          h.solo.filter((r) => matches(r, args.where, 'issuedAt')),
          'issuedAt',
        ).slice(0, args.take),
      ),
    },
    altairMatchPlayer: {
      findMany: vi.fn(async (args: { where: Where; take: number }) =>
        sorted(
          h.players.filter((r) => matches(r, args.where, 'createdAt')),
          'createdAt',
        )
          .slice(0, args.take)
          .map((r) => ({ ...r, match: r.match as Row })),
      ),
    },
    userBlock: {
      findMany: vi.fn(async () => h.blocks),
    },
  },
}));

const { listSoloRuns, listCoopMatches, exportAltairRuns, teammateView, RunsCursorError } =
  await import('../runs.server');
const { RUNS_PAGE_SIZE } = await import('../runs');

const at = (n: number) => new Date(Date.UTC(2026, 10, 1, 0, 0, n));

function solo(over: Row): Row {
  return {
    id: 'r?',
    userId: 'me',
    classId: 'knight',
    doubleTime: false,
    status: 'verified',
    issuedAt: at(1),
    result: null,
    rejectReason: null,
    coinsCredited: 0,
    firstClearBonus: 0,
    ...over,
  };
}

const goodResult = {
  status: 'victory',
  gameTime: 754.4,
  kills: 311,
  level: 14,
  bossesDefeated: ['hollow_king'],
  steps: 9,
};

function me(over: Row = {}): Row {
  return {
    id: 'p-me',
    matchId: 'm1',
    userId: 'me',
    createdAt: at(10),
    classId: 'knight',
    finalLevel: 9,
    kills: 80,
    coinsEarned: 40,
    timeSurvived: 600,
    wasDowned: false,
    wasRevived: false,
    revivesGiven: 1,
    wasAliveAtEnd: true,
    match: {
      id: 'm1',
      victory: true,
      durationMs: 600_000,
      playerCount: 3,
      doubleTime: false,
      sharedKills: 200,
      bossesDefeated: ['hollow_king'],
      players: [
        { userId: 'u-sam', classId: 'mage', user: { id: 'u-sam', name: 'Sam Now' } },
        { userId: 'u-blk', classId: 'rogue', user: { id: 'u-blk', name: 'Blocked Person' } },
      ],
    },
    ...over,
  };
}

beforeEach(() => {
  h.solo = [];
  h.players = [];
  h.blocks = [];
});

describe('listSoloRuns', () => {
  it('lists only the caller rows and leaves an open run out', async () => {
    h.solo = [
      solo({ id: 'a', status: 'verified', result: goodResult, coinsCredited: 120, firstClearBonus: 200 }),
      solo({ id: 'b', userId: 'someone-else', result: goodResult }),
      solo({ id: 'c', status: 'open', issuedAt: at(5) }),
    ];
    const page = await listSoloRuns('me');
    expect(page.runs.map((r) => r.id)).toEqual(['a']);
    expect(page.runs[0]).toMatchObject({
      status: 'verified',
      result: { outcome: 'victory', timeSurvived: 754.4, kills: 311, level: 14, bosses: 1 },
      coinsCredited: 120,
      firstClear: true,
    });
    expect(page.nextCursor).toBeNull();
  });

  it('maps a rejected run to its reason code and never carries the verifier detail', async () => {
    h.solo = [
      solo({ id: 'a', status: 'rejected', rejectReason: 'claim_mismatch: kills 9 vs 4' }),
      solo({ id: 'b', status: 'rejected', rejectReason: 'something new: x', issuedAt: at(0) }),
    ];
    const page = await listSoloRuns('me');
    expect(page.runs.map((r) => r.reason)).toEqual(['claim_mismatch', 'unknown']);
    expect(JSON.stringify(page)).not.toContain('kills 9');
  });

  it('shows the status only when the result does not parse, and never parses an unverified run', async () => {
    h.solo = [
      solo({ id: 'a', status: 'verified', result: { nope: true } }),
      solo({ id: 'b', status: 'unverified', result: goodResult, rejectReason: 'stale_sim: x', issuedAt: at(0) }),
    ];
    const page = await listSoloRuns('me');
    expect(page.runs[0]).toMatchObject({ status: 'verified', result: null });
    expect(page.runs[1]).toMatchObject({ status: 'unverified', result: null, reason: 'stale_sim', coinsCredited: 0 });
  });

  it('pages without a gap or a repeat, including rows that share a time', async () => {
    const total = RUNS_PAGE_SIZE * 2 + 5;
    h.solo = Array.from({ length: total }, (_, i) =>
      solo({ id: `r${String(i).padStart(3, '0')}`, issuedAt: at(Math.floor(i / 2)) }),
    );
    const seen: string[] = [];
    let cursor: string | undefined;
    let pages = 0;
    do {
      const page = await listSoloRuns('me', cursor);
      seen.push(...page.runs.map((r) => r.id));
      cursor = page.nextCursor ?? undefined;
      pages += 1;
    } while (cursor && pages < 10);
    expect(pages).toBe(3);
    expect(seen).toHaveLength(total);
    expect(new Set(seen).size).toBe(total);
  });

  it('refuses a cursor that is not one', async () => {
    await expect(listSoloRuns('me', 'not-a-cursor')).rejects.toBeInstanceOf(RunsCursorError);
  });
});

describe('listCoopMatches', () => {
  it('names teammates now, shows "A player" across a block in either direction, and never reads userName', async () => {
    h.players = [me()];
    h.blocks = [{ blockerId: 'u-blk', blockedId: 'me' }];
    const page = await listCoopMatches('me');
    expect(page.matches).toHaveLength(1);
    const m = page.matches[0]!;
    expect(m).toMatchObject({ victory: true, playerCount: 3, bossesDefeated: 1, me: { kills: 80, classId: 'knight' } });
    expect(m.teammates).toEqual([
      { kind: 'player', name: 'Sam Now', classId: 'mage' },
      { kind: 'blocked', classId: 'rogue' },
    ]);
    expect(JSON.stringify(page)).not.toContain('Blocked Person');
  });

  it('shows an erased teammate as deleted', async () => {
    const row = me();
    (row.match as { players: Row[] }).players = [
      { userId: 'u-gone', classId: 'mage', user: { id: 'u-gone', name: 'Deleted user' } },
    ];
    h.players = [row];
    const page = await listCoopMatches('me');
    expect(page.matches[0]!.teammates).toEqual([{ kind: 'deleted', classId: 'mage' }]);
  });

  it('lists only the caller rows and pages by the caller own row', async () => {
    h.players = [
      me({ id: 'p1', createdAt: at(3) }),
      me({ id: 'p2', createdAt: at(2), userId: 'other' }),
      me({ id: 'p3', createdAt: at(1) }),
    ];
    const page = await listCoopMatches('me');
    expect(page.matches.map((x) => x.id)).toEqual(['p1', 'p3']);
  });

  it('pages without a gap', async () => {
    const total = RUNS_PAGE_SIZE + 7;
    h.players = Array.from({ length: total }, (_, i) => me({ id: `p${String(i).padStart(3, '0')}`, createdAt: at(i) }));
    const first = await listCoopMatches('me');
    expect(first.matches).toHaveLength(RUNS_PAGE_SIZE);
    const second = await listCoopMatches('me', first.nextCursor ?? undefined);
    expect(second.matches).toHaveLength(7);
    expect(second.nextCursor).toBeNull();
    expect(new Set([...first.matches, ...second.matches].map((x) => x.id)).size).toBe(total);
  });
});

describe('teammateView', () => {
  it('treats a missing user row as erased', () => {
    expect(teammateView({ userId: 'x', classId: 'c', user: null }, new Set())).toEqual({
      kind: 'deleted',
      classId: 'c',
    });
  });
});

describe('exportAltairRuns', () => {
  it('exports the member runs without seeds, loadouts or teammate names', async () => {
    h.solo = [solo({ id: 'a', result: goodResult, seed: 12345, loadout: { greed: 2 } })];
    h.players = [me()];
    const out = await exportAltairRuns('me');
    expect(out.soloRuns).toHaveLength(1);
    expect(out.coopMatches[0]).toMatchObject({ matchId: 'm1', kills: 80, match: { victory: true } });
    const text = JSON.stringify(out);
    expect(text).not.toContain('12345');
    expect(text).not.toContain('greed');
    expect(text).not.toContain('Sam Now');
  });
});
