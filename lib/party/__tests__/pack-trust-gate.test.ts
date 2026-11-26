/**
 * s15-17: only trusted reporters count toward a pack's auto-hide. A reporter is trusted when the account is at least
 * 7 days old, has a verified e-mail or a linked sign-in provider, and is not banned. Every report is still filed and
 * reaches the queue; nothing the reporter or the owner sees differs by trust.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { assertJsonSafe } from '@/lib/db/query-shape';

type Row = Record<string, unknown>;
interface UserRow {
  id: string;
  createdAt: Date;
  emailVerified: boolean | null;
  bannedUntil: Date | null;
  linked: number;
}

const NOW = new Date('2026-12-01T12:00:00Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

const h = vi.hoisted(() => ({
  users: new Map<string, unknown>(),
  packs: [] as Row[],
  reports: [] as Row[],
  log: [] as string[],
  findManyArgs: [] as Row[],
}));

const matches = (row: Row, where: Row): boolean =>
  Object.entries(where).every(([k, v]) => {
    if (v === undefined) return true;
    if (v && typeof v === 'object' && !(v instanceof Date)) {
      const o = v as { in?: unknown[]; not?: unknown };
      if (o.in) return o.in.includes(row[k]);
      if ('not' in o) return row[k] !== o.not;
    }
    return row[k] === v;
  });

vi.mock('@/lib/prisma.server', async () => {
  const { shapeChecked } = await import('@/lib/db/query-shape');
  const client = {
    $executeRaw: vi.fn(async () => {
      h.log.push('lock');
      return 1;
    }),
    rmhboxPack: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => h.packs.find((p) => p.id === where.id) ?? null),
      findMany: vi.fn(async ({ where }: { where: Row }) => h.packs.filter((p) => matches(p, where))),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Row }) => {
        const p = h.packs.find((x) => x.id === where.id);
        if (!p) throw new Error('missing');
        return Object.assign(p, data);
      }),
      updateMany: vi.fn(async ({ where, data }: { where: Row; data: Row }) => {
        const hit = h.packs.filter((p) => matches(p, where));
        for (const p of hit) Object.assign(p, data);
        return { count: hit.length };
      }),
    },
    contentReport: {
      findFirst: vi.fn(async ({ where }: { where: Row }) => h.reports.find((r) => matches(r, where)) ?? null),
      findMany: vi.fn(async (args: { where: Row; select: { reporter?: { select: Row } } }) => {
        h.findManyArgs.push(args as unknown as Row);
        return h.reports
          .filter((r) => matches(r, args.where))
          .map((r) => ({
            entityId: r.entityId,
            reporterId: r.reporterId,
            ...(args.select.reporter ? { reporter: h.users.get(r.reporterId as string) ?? null } : {}),
          }));
      }),
      count: vi.fn(async ({ where }: { where: Row }) => h.reports.filter((r) => matches(r, where)).length),
      create: vi.fn(async ({ data }: { data: Row }) => {
        const row = { id: `r${h.reports.length + 1}`, status: 'PENDING', ...data };
        h.reports.push(row);
        return row;
      }),
    },
  };
  const checked = shapeChecked(client);
  return {
    prisma: Object.assign(Object.create(checked), {
      $transaction: async (fn: (tx: unknown) => unknown) => fn(checked),
    }),
  };
});

vi.mock('@/lib/feed/audience.server', () => ({ viewerVisiblePostWhere: vi.fn(async () => ({})) }));
vi.mock('@/lib/moderation.server', () => ({ getBlockedAuthorIds: vi.fn(async () => []) }));
vi.mock('@/lib/notifications.server', () => ({ createNotification: vi.fn(async () => null) }));

import {
  countsTowardAutoHide,
  filePackReport,
  packPreviews,
  restoreReportedPack,
} from '@/lib/party/pack-moderation.server';
import { listPacks, reportPack } from '@/lib/party/packs.server';
import { PACK_AUTOHIDE_MIN_ACCOUNT_DAYS, PACK_AUTOHIDE_REPORTS } from '@/lib/party/packs';

/** What the one query returns for a reporter: the facts the gate reads (`accounts` limited to one). */
function addUser(id: string, u: Partial<UserRow> = {}) {
  const row: UserRow = { id, createdAt: daysAgo(30), emailVerified: true, bannedUntil: null, linked: 0, ...u };
  h.users.set(id, {
    createdAt: row.createdAt,
    emailVerified: row.emailVerified,
    bannedUntil: row.bannedUntil,
    accounts: Array.from({ length: Math.min(row.linked, 1) }, (_, i) => ({ id: `acc${i}` })),
  });
}

const file = (reporterId: string) =>
  filePackReport({ reporterId, packId: 'p1', reason: 'OTHER', details: 'bad lines', now: NOW });

beforeEach(() => {
  h.users = new Map();
  h.reports = [];
  h.log = [];
  h.findManyArgs = [];
  h.packs = [
    {
      id: 'p1',
      ownerId: 'owner',
      hidden: false,
      featured: false,
      reportCount: 0,
      moderatedAt: null,
      autoHiddenAt: null,
      code: 'ABC234',
      name: 'Pack one',
      game: 'identity-crisis',
      promptCount: 20,
      prompts: Array.from({ length: 20 }, (_, i) => `Person Number ${i + 1}`),
      owner: { id: 'owner', name: 'Owner', handle: 'owner' },
    },
  ];
});

describe('who counts', () => {
  const base = { createdAt: daysAgo(30), emailVerified: true, bannedUntil: null, accounts: [] as unknown[] };
  it('is a week-old account with a verified e-mail or a linked provider that is not banned', () => {
    expect(PACK_AUTOHIDE_MIN_ACCOUNT_DAYS).toBe(7);
    expect(countsTowardAutoHide(base, NOW)).toBe(true);
    expect(countsTowardAutoHide({ ...base, emailVerified: null, accounts: [{}] }, NOW)).toBe(true);
    expect(countsTowardAutoHide({ ...base, createdAt: daysAgo(7) }, NOW)).toBe(true);
    expect(countsTowardAutoHide({ ...base, createdAt: daysAgo(6.9) }, NOW)).toBe(false);
    expect(countsTowardAutoHide({ ...base, createdAt: daysAgo(0) }, NOW)).toBe(false);
  });
  it('never counts emailVerified null or false without a linked provider', () => {
    expect(countsTowardAutoHide({ ...base, emailVerified: null }, NOW)).toBe(false);
    expect(countsTowardAutoHide({ ...base, emailVerified: false }, NOW)).toBe(false);
  });
  it('never counts a banned reporter, and a ban that has ended does not matter', () => {
    expect(countsTowardAutoHide({ ...base, bannedUntil: new Date(NOW.getTime() + 1000) }, NOW)).toBe(false);
    expect(countsTowardAutoHide({ ...base, bannedUntil: new Date(NOW.getTime() - 1000) }, NOW)).toBe(true);
  });
});

describe('the auto-hide', () => {
  it('is not triggered by three reports from accounts made today, which still reach the queue', async () => {
    for (const id of ['a', 'b', 'c']) addUser(id, { createdAt: daysAgo(0) });
    for (const id of ['a', 'b', 'c']) await file(id);
    expect(h.reports).toHaveLength(3);
    expect(h.packs[0]).toMatchObject({ hidden: false, autoHiddenAt: null, reportCount: 3 });
    expect(PACK_AUTOHIDE_REPORTS).toBe(3);
  });

  it('is triggered by three trusted accounts', async () => {
    for (const id of ['a', 'b', 'c']) addUser(id);
    await file('a');
    await file('b');
    expect(h.packs[0]).toMatchObject({ hidden: false });
    const r = await file('c');
    expect(r).toMatchObject({ ok: true, hidden: true });
    expect(h.packs[0]).toMatchObject({ hidden: true, featured: false, reportCount: 3 });
    expect(h.packs[0]?.autoHiddenAt).toEqual(NOW);
  });

  it('counts only the trusted ones in a mix', async () => {
    addUser('t1');
    addUser('t2');
    addUser('new1', { createdAt: daysAgo(1) });
    addUser('new2', { createdAt: daysAgo(2) });
    for (const id of ['t1', 'new1', 'new2', 't2']) await file(id);
    // Four distinct reporters, two of them trusted: not hidden.
    expect(h.packs[0]).toMatchObject({ hidden: false, reportCount: 4 });
    addUser('t3', { linked: 1, emailVerified: null });
    await file('t3');
    expect(h.packs[0]).toMatchObject({ hidden: true, reportCount: 5 });
  });

  it('never counts a banned reporter', async () => {
    addUser('t1');
    addUser('t2');
    addUser('banned', { bannedUntil: new Date(NOW.getTime() + 86_400_000) });
    for (const id of ['t1', 't2', 'banned']) await file(id);
    expect(h.packs[0]).toMatchObject({ hidden: false, reportCount: 3 });
  });

  it('does not count emailVerified null as verified', async () => {
    addUser('t1');
    addUser('t2');
    addUser('unverified', { emailVerified: null, linked: 0 });
    for (const id of ['t1', 't2', 'unverified']) await file(id);
    expect(h.packs[0]).toMatchObject({ hidden: false });
  });

  it('reads the reporters in one query, after the lock, and asks only for the gate facts', async () => {
    for (const id of ['a', 'b']) addUser(id);
    await file('a');
    await file('b');
    expect(h.log[0]).toBe('lock');
    const counts = h.findManyArgs.filter((a) => (a.select as Row).reporter);
    expect(counts).toHaveLength(2);
    expect((counts[0]!.select as Row).reporter).toEqual({
      select: {
        createdAt: true,
        emailVerified: true,
        bannedUntil: true,
        // An e-mail and password sign-in is an `Account` row too (`credential`); only an OAuth provider counts.
        accounts: { where: { providerId: { not: 'credential' } }, select: { id: true }, take: 1 },
      },
    });
  });

  it('a dismissal that leaves no open report still restores a pack the reports hid', async () => {
    for (const id of ['a', 'b', 'c']) addUser(id);
    for (const id of ['a', 'b', 'c']) await file(id);
    expect(h.packs[0]).toMatchObject({ hidden: true });
    for (const r of h.reports) r.status = 'DISMISSED';
    expect(await restoreReportedPack('p1')).toBe(true);
    expect(h.packs[0]).toMatchObject({ hidden: false, autoHiddenAt: null, reportCount: 0 });
  });
});

describe('nothing differs for the reporter or the owner', () => {
  it('answers the reporter the same whether or not their report counted', async () => {
    addUser('new1', { createdAt: daysAgo(0) });
    addUser('trusted');
    const fromNew = await reportPack('new1', 'p1', 'bad lines');
    const fromTrusted = await reportPack('trusted', 'p1', 'bad lines');
    assertJsonSafe(fromNew);
    expect(fromNew).toEqual(fromTrusted);
    expect(fromNew).toEqual({ ok: true, duplicate: false });
  });

  it('shows the owner the same pack view with three untrusted reports as with none, and no counts', async () => {
    const before = await listPacks('owner', false);
    for (const id of ['a', 'b', 'c']) addUser(id, { createdAt: daysAgo(0) });
    for (const id of ['a', 'b', 'c']) await file(id);
    const after = await listPacks('owner', false);
    assertJsonSafe(after);
    expect(after).toEqual(before);
    expect(JSON.stringify(after)).not.toMatch(/reportCount|reporter|counted/i);
  });

  it('shows the owner only that the pack is hidden once trusted reports hid it', async () => {
    for (const id of ['a', 'b', 'c']) addUser(id);
    for (const id of ['a', 'b', 'c']) await file(id);
    const mine = (await listPacks('owner', false)).mine[0]!;
    expect(mine.hidden).toBe(true);
    expect(Object.keys(mine).sort()).toEqual(
      ['author', 'code', 'featured', 'game', 'hidden', 'id', 'mine', 'name', 'promptCount'].sort(),
    );
  });
});

describe('the moderators’ queue line', () => {
  it('says how many open reports counted, never which', async () => {
    addUser('t1');
    addUser('new1', { createdAt: daysAgo(1) });
    addUser('new2', { createdAt: daysAgo(1) });
    for (const id of ['t1', 'new1', 'new2']) await file(id);
    const text = (await packPreviews(['p1'])).get('p1') ?? '';
    expect(text).toContain('Pack one (identity-crisis, 20 prompts)');
    expect(text).toContain('Counted toward the auto-hide: 1 of 3');
    expect(text).not.toMatch(/t1|new1|new2|trusted/);
  });
});
