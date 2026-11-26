import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * s13-16: RMHBox packs in the site's report queue. A fake database holds packs and content reports; the lock is
 * recorded so the order (lock, then reads and writes) can be asserted.
 */

type Pack = {
  id: string;
  ownerId: string;
  hidden: boolean;
  featured: boolean;
  reportCount: number;
  moderatedAt: Date | null;
  autoHiddenAt: Date | null;
  code: string;
  name: string;
  game: string;
  promptCount: number;
  prompts: unknown;
  owner: unknown;
};
type Report = {
  id: string;
  reporterId: string;
  entityType: string;
  entityId: string;
  reason: string;
  details: string | null;
  status: string;
  targetUserId: string | null;
};

const h = vi.hoisted(() => ({
  packs: [] as Pack[],
  reports: [] as Report[],
  log: [] as string[],
}));

const matches = (row: Record<string, unknown>, where: Record<string, unknown>): boolean =>
  Object.entries(where).every(([k, v]) => {
    if (v === undefined) return true;
    if (v && typeof v === 'object' && !(v instanceof Date)) {
      const o = v as { in?: unknown[]; not?: unknown };
      if (o.in) return o.in.includes(row[k]);
      if ('not' in o) return row[k] !== o.not;
    }
    return row[k] === v;
  });

function fakeClient() {
  return {
    $executeRaw: vi.fn(async () => {
      h.log.push('lock');
      return 1;
    }),
    rmhboxPack: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        h.log.push('pack.read');
        return h.packs.find((p) => p.id === where.id) ?? null;
      }),
      findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) =>
        h.packs.filter((p) => matches(p as unknown as Record<string, unknown>, where)),
      ),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<Pack> }) => {
        const p = h.packs.find((x) => x.id === where.id);
        if (!p) throw new Error('missing');
        Object.assign(p, data);
        return p;
      }),
      updateMany: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Partial<Pack> }) => {
        const hit = h.packs.filter((p) => matches(p as unknown as Record<string, unknown>, where));
        for (const p of hit) Object.assign(p, data);
        if (hit.length) h.log.push(`pack.write:${Object.keys(data).join(',')}`);
        return { count: hit.length };
      }),
    },
    contentReport: {
      findFirst: vi.fn(
        async ({ where }: { where: Record<string, unknown> }) =>
          h.reports.find((r) => matches(r as unknown as Record<string, unknown>, where)) ?? null,
      ),
      // s15-17: the auto-hide counts only trusted reporters, so every reporter here is a week-old verified account
      // (the trust gate itself is held by pack-trust-gate.test.ts).
      findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) =>
        h.reports
          .filter((r) => matches(r as unknown as Record<string, unknown>, where))
          .map((r) => ({
            ...r,
            reporter: {
              createdAt: new Date('2020-01-01T00:00:00Z'),
              emailVerified: true,
              bannedUntil: null,
              accounts: [],
            },
          })),
      ),
      count: vi.fn(
        async ({ where }: { where: Record<string, unknown> }) =>
          h.reports.filter((r) => matches(r as unknown as Record<string, unknown>, where)).length,
      ),
      findUnique: vi.fn(
        async ({ where }: { where: { id: string } }) => h.reports.find((r) => r.id === where.id) ?? null,
      ),
      updateMany: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Partial<Report> }) => {
        const hit = h.reports.filter((r) => matches(r as unknown as Record<string, unknown>, where));
        for (const r of hit) Object.assign(r, data);
        return { count: hit.length };
      }),
      create: vi.fn(async ({ data }: { data: Omit<Report, 'id' | 'status'> }) => {
        h.log.push('report.create');
        const row = { id: `r${h.reports.length + 1}`, status: 'PENDING', ...data };
        h.reports.push(row);
        return row;
      }),
    },
  };
}

vi.mock('@/lib/prisma.server', () => {
  const client = fakeClient();
  return {
    prisma: {
      ...client,
      $transaction: async (fn: (tx: unknown) => unknown) => fn(client),
    },
  };
});

vi.mock('@/lib/feed/audience.server', () => ({ viewerVisiblePostWhere: vi.fn(async () => ({})) }));
vi.mock('@/lib/moderation.server', () => ({ getBlockedAuthorIds: vi.fn(async () => []) }));
vi.mock('@/lib/notifications.server', () => ({ createNotification: vi.fn(async () => null) }));

import { withdrawReport } from '@/lib/moderation/my-reports.server';
import {
  filePackReport,
  packPreviews,
  packReportAuthor,
  restoreReportedPack,
  takeDownPack,
} from '@/lib/party/pack-moderation.server';
import { adminSetPack, listPacks, reportPack } from '@/lib/party/packs.server';
import { REMOVABLE_REPORT_ENTITY_TYPES, REPORT_ENTITY_TYPES } from '@/lib/moderation/report-constants';

const root = join(__dirname, '..', '..', '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

const pack = (over: Partial<Pack> = {}): Pack => ({
  id: 'p1',
  ownerId: 'owner',
  hidden: false,
  featured: true,
  reportCount: 0,
  moderatedAt: null,
  autoHiddenAt: null,
  code: 'ABC234',
  name: 'Pack one',
  game: 'wit-war',
  promptCount: 12,
  prompts: Array.from({ length: 12 }, (_, i) => `Prompt number ${i + 1}`),
  owner: { id: 'owner', name: 'Owner', handle: 'owner' },
  ...over,
});
const file = (reporterId: string, packId = 'p1') =>
  filePackReport({ reporterId, packId, reason: 'OTHER', details: 'bad prompts' });

beforeEach(() => {
  h.packs = [pack()];
  h.reports = [];
  h.log = [];
});

describe('filing a pack report', () => {
  it('files a ContentReport of type rmhbox-pack aimed at the owner', async () => {
    const r = await file('a');
    expect(r).toEqual({ ok: true, duplicate: false, hidden: false });
    expect(h.reports).toHaveLength(1);
    expect(h.reports[0]).toMatchObject({
      entityType: 'rmhbox-pack',
      entityId: 'p1',
      reporterId: 'a',
      targetUserId: 'owner',
      details: 'bad prompts',
    });
    expect(h.packs[0]).toMatchObject({ hidden: false, reportCount: 1, autoHiddenAt: null });
  });

  it('refuses the owner, a missing pack and a removed pack; a repeat reporter files once', async () => {
    expect(await file('owner')).toEqual({ ok: false, reason: 'own-pack' });
    expect(await file('a', 'nope')).toEqual({ ok: false, reason: 'not-found' });
    h.packs.push(pack({ id: 'gone', moderatedAt: new Date() }));
    expect(await file('a', 'gone')).toEqual({ ok: false, reason: 'not-found' });
    expect(await packReportAuthor('gone')).toBeNull();
    expect(await packReportAuthor('p1')).toBe('owner');
    await file('a');
    expect(await file('a')).toMatchObject({ ok: true, duplicate: true });
    expect(h.reports).toHaveLength(1);
  });

  it('three distinct reporters hide the pack and stamp autoHiddenAt', async () => {
    await file('a');
    await file('b');
    expect(h.packs[0]).toMatchObject({ hidden: false, autoHiddenAt: null });
    const r = await file('c');
    expect(r).toMatchObject({ ok: true, hidden: true });
    expect(h.packs[0]).toMatchObject({ hidden: true, featured: false, reportCount: 3 });
    expect(h.packs[0]?.autoHiddenAt).toBeInstanceOf(Date);
  });

  it('takes the lock first and hides once when two reports race at the threshold', async () => {
    await file('a');
    await file('b');
    h.log = [];
    await Promise.all([file('c'), file('d')]);
    // Each transaction starts with the lock, before it reads or writes anything.
    expect(h.log[0]).toBe('lock');
    expect(h.log.indexOf('lock')).toBeLessThan(h.log.indexOf('pack.read'));
    expect(h.log.filter((l) => l === 'pack.write:hidden,featured,autoHiddenAt,reportCount')).toHaveLength(1);
    expect(h.packs[0]?.hidden).toBe(true);
  });

  it('does not stamp autoHiddenAt on a pack an admin already hid', async () => {
    h.packs = [pack({ hidden: true })];
    await file('a');
    await file('b');
    await file('c');
    expect(h.packs[0]).toMatchObject({ hidden: true, autoHiddenAt: null });
  });

  it('the old route files the same report, with the text as details and reason OTHER', async () => {
    const r = await reportPack('a', 'p1', 'rude prompts');
    expect(r).toEqual({ ok: true, duplicate: false });
    expect(h.reports[0]).toMatchObject({ entityType: 'rmhbox-pack', reason: 'OTHER', details: 'rude prompts' });
    expect(await reportPack('owner', 'p1', 'mine')).toMatchObject({ ok: false, status: 400 });
    expect(await reportPack('a', 'nope', 'x')).toMatchObject({ ok: false, status: 404 });
    const route = read('lib/rmhbox/api/rmhbox.packs.$id.report.server.ts');
    expect(route).toContain('reportPack(');
    expect(read('lib/party/packs.server.ts')).not.toContain('rmhboxPackReport');
  });
});

describe('decisions', () => {
  it('removing sets moderatedAt and sticks against adminSetPack', async () => {
    const at = new Date('2026-12-01T00:00:00Z');
    expect(await takeDownPack('p1', at)).toBe(true);
    expect(h.packs[0]).toMatchObject({ hidden: true, featured: false, moderatedAt: at });
    expect(await takeDownPack('p1', new Date())).toBe(false);
    expect(h.packs[0]?.moderatedAt).toBe(at);
    expect(await adminSetPack('p1', { hidden: false })).toBe('removed');
    expect(await adminSetPack('p1', { featured: true })).toBe('removed');
    expect(h.packs[0]).toMatchObject({ hidden: true, featured: false });
    expect(await adminSetPack('p1', { hidden: true })).toBe('ok');
    expect(await adminSetPack('nope', { hidden: true })).toBe('not-found');
  });

  it('dismissing the last open report of an auto-hidden pack restores it', async () => {
    await file('a');
    await file('b');
    await file('c');
    // Two dismissed: one report is still open, so the pack stays hidden.
    for (const r of h.reports.slice(0, 2)) r.status = 'DISMISSED';
    expect(await restoreReportedPack('p1')).toBe(false);
    expect(h.packs[0]?.hidden).toBe(true);
    h.reports[2]!.status = 'DISMISSED';
    expect(await restoreReportedPack('p1')).toBe(true);
    expect(h.packs[0]).toMatchObject({ hidden: false, autoHiddenAt: null, reportCount: 0 });
  });

  it('withdrawing the last open report of an auto-hidden pack restores it; one still open keeps it hidden', async () => {
    await file('a');
    await file('b');
    await file('c');
    const [ra, rb, rc] = h.reports;
    expect(await withdrawReport('a', ra!.id)).toBe('withdrawn');
    expect(await withdrawReport('b', rb!.id)).toBe('withdrawn');
    expect(h.packs[0]?.hidden).toBe(true);
    expect(await withdrawReport('c', rc!.id)).toBe('withdrawn');
    expect(h.packs[0]).toMatchObject({ hidden: false, autoHiddenAt: null, reportCount: 0 });
  });

  it('a pack an admin hid by hand is not restored by a dismissal', async () => {
    await file('a');
    await adminSetPack('p1', { hidden: true });
    expect(h.packs[0]?.autoHiddenAt).toBeNull();
    h.reports[0]!.status = 'DISMISSED';
    expect(await restoreReportedPack('p1')).toBe(false);
    expect(h.packs[0]?.hidden).toBe(true);
  });

  it('an admin hiding a pack the reports hid turns it into the admin’s decision', async () => {
    h.packs = [pack({ hidden: true, autoHiddenAt: new Date() })];
    await adminSetPack('p1', { hidden: true });
    expect(h.packs[0]?.autoHiddenAt).toBeNull();
  });

  it('never restores a removed pack', async () => {
    h.packs = [pack({ hidden: true, autoHiddenAt: new Date() })];
    await takeDownPack('p1');
    expect(await restoreReportedPack('p1')).toBe(false);
    expect(h.packs[0]?.hidden).toBe(true);
  });

  it('shows a moderator the pack, its state and its first prompts', async () => {
    h.packs = [
      pack({
        autoHiddenAt: new Date(),
        prompts: Array.from({ length: 30 }, (_, i) => `Prompt number ${i + 1}`),
        promptCount: 30,
      }),
    ];
    const out = await packPreviews(['p1']);
    const text = out.get('p1') ?? '';
    expect(text).toContain('Pack one (wit-war, 30 prompts)');
    expect(text).toContain('waiting for review');
    expect(text).toContain('20. Prompt number 20');
    expect(text).not.toContain('21. ');
    expect((await packPreviews([])).size).toBe(0);
  });
});

describe('who can read a removed pack', () => {
  it('is in no shelf but its owner’s own, marked', async () => {
    h.packs = [
      pack({ id: 'a', featured: true }),
      pack({ id: 'b', featured: false, ownerId: 'o2', moderatedAt: new Date() }),
    ];
    const asOther = await listPacks('someone', false);
    expect([...asOther.featured, ...asOther.recent].map((p) => p.id)).toEqual(['a']);
    const asOwner = await listPacks('o2', false);
    expect(asOwner.recent.map((p) => p.id)).toEqual([]);
    expect(asOwner.mine).toHaveLength(1);
    expect(asOwner.mine[0]).toMatchObject({ id: 'b', moderated: true });
    expect((await listPacks('someone', false)).mine).toEqual([]);
  });

  it('the shelf queries and the lobby loader both filter on moderatedAt', () => {
    const shelf = read('lib/party/packs.server.ts');
    expect(shelf.match(/hidden: false, moderatedAt: null/g)).toHaveLength(2);
    expect(read('server/rmhbox/pack-loader.ts')).toMatch(/moderatedAt: null/);
  });
});

describe('the report type', () => {
  it('is reportable and removable, with a takedown branch and a preview', () => {
    expect(REPORT_ENTITY_TYPES).toContain('rmhbox-pack');
    expect(REMOVABLE_REPORT_ENTITY_TYPES).toContain('rmhbox-pack');
    const triage = read('lib/moderation/triage.server.ts');
    expect(triage).toContain('takeDownPack');
    expect(triage).toContain('restoreReportedPack');
    expect(triage).toContain('packPreviews');
    expect(read('lib/moderation/api/moderation.report.server.ts')).toContain('packReportAuthor');
    expect(read('lib/moderation/my-reports.server.ts')).toContain("'rmhbox-pack'");
    expect(read('components/moderation/MyReportsPanel.tsx')).toContain("'rmhbox-pack'");
  });
});

describe('the migration', () => {
  const sql = read('prisma/migrations/20261220030100_s13_pack_reports/migration.sql');
  it('adds the two columns and stamps the packs three reports hid', () => {
    expect(sql).toContain('ALTER TABLE "rmhbox_pack" ADD COLUMN "moderatedAt" TIMESTAMP(3)');
    expect(sql).toContain('ALTER TABLE "rmhbox_pack" ADD COLUMN "autoHiddenAt" TIMESTAMP(3)');
    expect(sql).toContain('UPDATE "rmhbox_pack" SET "autoHiddenAt" = now() WHERE "hidden" AND "reportCount" >= 3');
  });
  it('copies the old reports once, with the real table and column names', () => {
    expect(sql).toContain('INSERT INTO "content_report"');
    expect(sql).toContain('FROM "rmhbox_pack_report"');
    for (const col of ['"reporterId"', '"entityType"', '"entityId"', '"targetUserId"', '"ownerId"', '"packId"'])
      expect(sql).toContain(col);
    expect(sql).toContain('gen_random_uuid()::text');
    expect(sql).toContain('\'OTHER\'::"ReportReason"');
    expect(sql).toMatch(
      /WHERE NOT EXISTS \(\s*SELECT 1 FROM "content_report" c\s*WHERE c\."reporterId" = r\."reporterId" AND c\."entityType" = 'rmhbox-pack' AND c\."entityId" = r\."packId"/,
    );
    expect(sql.match(/INSERT INTO/g)).toHaveLength(1);
  });
  it('names real schema tables and columns', () => {
    const schema = read('prisma/schema/games/rmhbox.prisma');
    expect(schema).toContain('@@map("rmhbox_pack_report")');
    expect(schema).toMatch(/moderatedAt\s+DateTime\?/);
    expect(schema).toMatch(/autoHiddenAt\s+DateTime\?/);
    expect(read('prisma/schema/moderation.prisma')).toContain('@@map("content_report")');
  });
});
