import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { assertJsonSafe } from '@/lib/db/query-shape';
import { handlersOfModule } from '@/lib/__tests__/api-handlers-of';
import {
  MEMBER_ITEM_REPORT_TYPES,
  REMOVABLE_REPORT_ENTITY_TYPES,
  REPORT_ENTITY_TYPES,
} from '@/lib/moderation/report-constants';
import { WORKSHOP_REPORT_TYPES } from '@/lib/moderation/workshop-moderation';

/**
 * s15-04: a TF2 HUD, a TF2 loadout and a shared Versecraft story go through the report flow as `tf2-hud`,
 * `tf2-loadout` and `versecraft-seed`. Each resolves the member who made it, is refused for its own author, for a
 * private HUD or loadout and for an item already removed, and each takedown stamps `moderatedAt` once (a HUD and a
 * loadout are made private in the same write). The route and the takedown run against a small in-memory database that
 * is wrapped in `shapeChecked`, so a query Postgres would reject fails here too.
 */

type Row = Record<string, unknown>;
const h = vi.hoisted(() => ({
  huds: [] as Row[],
  loadouts: [] as Row[],
  seeds: [] as Row[],
  reports: [] as Row[],
}));

const matches = (row: Row, where: Row): boolean =>
  Object.entries(where).every(([k, v]) => {
    // The account filter on the owner or author relation (not banned) is exercised by the read-path suite.
    if (k === 'owner' || k === 'author') return true;
    if (v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date)) {
      const op = v as Row;
      if ('in' in op) return (op.in as unknown[]).includes(row[k]);
      if ('notIn' in op) return !(op.notIn as unknown[]).includes(row[k]);
      if ('not' in op) return row[k] !== op.not;
    }
    return row[k] === v;
  });
const user = (id: string) => ({
  id,
  name: `Name ${id}`,
  username: null,
  handle: id,
  image: null,
  profile: null,
  inventory: [],
});
const model = (rows: () => Row[], ownerKey: 'owner' | 'author') => ({
  findUnique: vi.fn(async ({ where }: { where: Row }) => rows().find((r) => matches(r, where)) ?? null),
  findMany: vi.fn(async ({ where }: { where: Row }) =>
    rows()
      .filter((r) => matches(r, where))
      .map((r) => ({ ...r, [ownerKey]: user(String(r.ownerId ?? r.authorId)) })),
  ),
  updateMany: vi.fn(async ({ where, data }: { where: Row; data: Row }) => {
    const hit = rows().filter((r) => matches(r, where));
    for (const r of hit) Object.assign(r, data);
    return { count: hit.length };
  }),
});

vi.mock('@/lib/prisma.server', async () => {
  const { shapeChecked } = await import('@/lib/db/query-shape');
  return {
    prisma: shapeChecked({
      tf2Hud: model(() => h.huds, 'owner'),
      tf2Loadout: model(() => h.loadouts, 'owner'),
      versecraftSeedListing: model(() => h.seeds, 'author'),
      contentReport: {
        findFirst: vi.fn(async () => null),
        create: vi.fn(async ({ data }: { data: Row }) => {
          h.reports.push(data);
          return data;
        }),
      },
    }),
  };
});
vi.mock('@/lib/api/handler.server', () => ({ defineHandler: (_o: unknown, fn: unknown) => fn }));
vi.mock('@/lib/admin-review.server', () => ({ notifyAdminsOfReview: vi.fn(async () => {}) }));
vi.mock('@/lib/rmhmusic/learn/moderation.server', () => ({ musicReportOwner: vi.fn(), hideMusicContent: vi.fn() }));
vi.mock('@/lib/cached.server', () => ({ cached: vi.fn(), invalidateCached: vi.fn(async () => {}) }));

type Handler = (a: { session: { user: { id: string } }; body: Record<string, unknown> }) => Promise<Response>;

async function report(reporter: string, entityType: string, entityId: string) {
  const mod = await import('@/lib/moderation/api/moderation.report.server');
  const post = handlersOfModule<Handler>(mod).POST!;
  return post({ session: { user: { id: reporter } }, body: { entityType, entityId, reason: 'SPAM' } });
}

beforeEach(() => {
  h.huds = [
    {
      id: 'h1',
      slug: 'neon-1',
      ownerId: 'u1',
      visibility: 'PUBLIC',
      moderatedAt: null,
      title: 'Neon HUD',
      description: 'Clean',
    },
    { id: 'h2', ownerId: 'u1', visibility: 'UNLISTED', moderatedAt: null, title: 'Link HUD', description: '' },
    { id: 'h3', ownerId: 'u1', visibility: 'PRIVATE', moderatedAt: null, title: 'Secret HUD', description: '' },
  ];
  h.loadouts = [
    {
      id: 'l1',
      slug: 'spy-1',
      ownerId: 'u1',
      visibility: 'PUBLIC',
      moderatedAt: null,
      title: 'Spy kit',
      description: 'Hi',
    },
    { id: 'l2', ownerId: 'u1', visibility: 'UNLISTED', moderatedAt: null, title: 'Link kit', description: '' },
    { id: 'l3', ownerId: 'u1', visibility: 'PRIVATE', moderatedAt: null, title: 'Secret kit', description: '' },
  ];
  h.seeds = [{ id: 's1', authorId: 'u1', moderatedAt: null, title: 'A story' }];
  h.reports = [];
});

const CASES = [
  ['tf2-hud', 'h1'],
  ['tf2-loadout', 'l1'],
  ['versecraft-seed', 's1'],
] as const;

describe('the three types', () => {
  it('are reportable, removable and held to the member-item rule', () => {
    expect([...WORKSHOP_REPORT_TYPES].sort()).toEqual(['tf2-hud', 'tf2-loadout', 'versecraft-seed']);
    for (const type of WORKSHOP_REPORT_TYPES) {
      expect(REPORT_ENTITY_TYPES).toContain(type);
      expect(REMOVABLE_REPORT_ENTITY_TYPES).toContain(type);
      expect(MEMBER_ITEM_REPORT_TYPES.has(type)).toBe(true);
    }
  });
});

describe('filing a report', () => {
  it.each(CASES)('%s: resolves the member who made it', async (type, id) => {
    const res = await report('reporter', type, id);
    expect(res.status).toBe(200);
    expect(h.reports).toEqual([expect.objectContaining({ entityType: type, entityId: id, targetUserId: 'u1' })]);
  });

  it.each([
    ['tf2-hud', 'h2'],
    ['tf2-loadout', 'l2'],
  ] as const)('%s: an unlisted one can be reported (a reporter can open it by link)', async (type, id) => {
    expect((await report('reporter', type, id)).status).toBe(200);
    expect(h.reports).toHaveLength(1);
  });

  it.each([
    ['tf2-hud', 'h3'],
    ['tf2-loadout', 'l3'],
  ] as const)('%s: a private one is a 404, as a missing one is', async (type, id) => {
    expect((await report('reporter', type, id)).status).toBe(404);
    expect(h.reports).toHaveLength(0);
  });

  it.each(CASES)('%s: its own author cannot report it', async (type, id) => {
    const res = await report('u1', type, id);
    expect(res.status).toBe(403);
    expect(h.reports).toHaveLength(0);
  });

  it.each(CASES)('%s: a missing item is a 404', async (type) => {
    expect((await report('reporter', type, 'nope')).status).toBe(404);
    expect(h.reports).toHaveLength(0);
  });

  it.each([
    ['tf2-hud', 'h1', 'huds'],
    ['tf2-loadout', 'l1', 'loadouts'],
    ['versecraft-seed', 's1', 'seeds'],
  ] as const)('%s: an item already taken down cannot be reported again', async (type, id, store) => {
    (h[store].find((r) => r.id === id) as Row).moderatedAt = new Date();
    expect((await report('reporter', type, id)).status).toBe(404);
    expect(h.reports).toHaveLength(0);
  });
});

describe('the takedown', () => {
  it('stamps a HUD and makes it private in one write, once', async () => {
    const { takeDownWorkshopItem } = await import('@/lib/moderation/workshop-moderation.server');
    const at = new Date('2027-01-05T10:00:00Z');
    expect(await takeDownWorkshopItem('tf2-hud', 'h1', at)).toBe(true);
    expect(h.huds[0]).toMatchObject({ visibility: 'PRIVATE', moderatedAt: at });
    // A second decision never moves the stamp.
    expect(await takeDownWorkshopItem('tf2-hud', 'h1', new Date('2027-02-01T00:00:00Z'))).toBe(false);
    expect(h.huds[0]).toMatchObject({ moderatedAt: at });
    // The other HUDs are untouched.
    expect(h.huds[1]).toMatchObject({ visibility: 'UNLISTED', moderatedAt: null });
  });

  it('stamps a loadout and makes it private in one write, once', async () => {
    const { takeDownWorkshopItem } = await import('@/lib/moderation/workshop-moderation.server');
    expect(await takeDownWorkshopItem('tf2-loadout', 'l2')).toBe(true);
    expect(h.loadouts[1]).toMatchObject({ visibility: 'PRIVATE', moderatedAt: expect.any(Date) });
    expect(await takeDownWorkshopItem('tf2-loadout', 'l2')).toBe(false);
  });

  it('stamps a story and leaves nothing else to change (its world stays)', async () => {
    const { takeDownWorkshopItem } = await import('@/lib/moderation/workshop-moderation.server');
    expect(await takeDownWorkshopItem('versecraft-seed', 's1')).toBe(true);
    expect(h.seeds[0]).toMatchObject({ moderatedAt: expect.any(Date) });
    expect(Object.keys(h.seeds[0]!).sort()).toEqual(['authorId', 'id', 'moderatedAt', 'title']);
    expect(await takeDownWorkshopItem('versecraft-seed', 's1')).toBe(false);
  });

  it('is dispatched by the queue for every type, and never touches a HUD blob', () => {
    const root = join(__dirname, '..', '..', '..');
    const triage = readFileSync(join(root, 'lib/moderation/triage.server.ts'), 'utf8');
    const takedown = triage.slice(triage.indexOf('async function takedownReportedContent'));
    for (const type of WORKSHOP_REPORT_TYPES) expect(takedown).toContain(`'${type}'`);
    expect(takedown).toContain('takeDownWorkshopItem');
    const server = readFileSync(join(root, 'lib/moderation/workshop-moderation.server.ts'), 'utf8');
    expect(server).not.toMatch(/tf2HudBlob|tf2HudUserBlob|versecraftWorld|\.delete/);
  });
});

describe('the queue preview and "Your reports"', () => {
  it('gives a moderator the kind, title, author and text of each reported item, whatever its state', async () => {
    const { workshopPreviews } = await import('@/lib/moderation/workshop-moderation.server');
    (h.huds[0] as Row).moderatedAt = new Date();
    const out = await workshopPreviews({ 'tf2-hud': ['h1'], 'tf2-loadout': ['l1'], 'versecraft-seed': ['s1'] });
    expect(out.get('tf2-hud:h1')).toBe('TF2 HUD "Neon HUD" by Name u1 (public): Clean');
    expect(out.get('tf2-loadout:l1')).toBe('TF2 loadout "Spy kit" by Name u1 (public): Hi');
    expect(out.get('versecraft-seed:s1')).toBe('Versecraft story "A story" by Name u1');
    assertJsonSafe([...out.entries()]);
  });

  it('shows the reporter an item only while it is live, public or unlisted and by someone they have not blocked', async () => {
    const { workshopTargets } = await import('@/lib/moderation/workshop-moderation.server');
    const ids = { 'tf2-hud': ['h1'], 'tf2-loadout': ['l1'], 'versecraft-seed': ['s1'] };
    const live = await workshopTargets(ids, []);
    expect(live.map((t) => [t.type, t.id])).toEqual([
      ['tf2-hud', 'h1'],
      ['tf2-loadout', 'l1'],
      ['versecraft-seed', 's1'],
    ]);
    expect(live.map((t) => t.href)).toEqual(['/tf2/hud-editor/h/neon-1', '/tf2/loadout/l/spy-1', null]);
    // A blocked author, a removed item and a private one read as unavailable.
    expect(await workshopTargets(ids, ['u1'])).toEqual([]);
    (h.huds[0] as Row).moderatedAt = new Date();
    (h.loadouts[0] as Row).visibility = 'PRIVATE';
    (h.seeds[0] as Row).moderatedAt = new Date();
    expect(await workshopTargets(ids, [])).toEqual([]);
  });

  it('shows the kind and a "gone" line for each type, and looks each one up', () => {
    const root = join(__dirname, '..', '..', '..');
    const read = (p: string) => readFileSync(join(root, p), 'utf8');
    const panel = read('components/moderation/MyReportsPanel.tsx');
    const label = read('components/feed/report-kind-label.ts');
    for (const type of WORKSHOP_REPORT_TYPES) {
      expect(panel).toContain(`t('kind-${type}'`);
      expect(panel).toContain(`t('gone-${type}'`);
      expect(label).toContain(`t('kind-${type}'`);
    }
    const mine = read('lib/moderation/my-reports.server.ts');
    expect(mine).toContain('workshopTargets');
    for (const type of WORKSHOP_REPORT_TYPES) expect(mine).toContain(`'${type}'`);
    const triage = read('lib/moderation/triage.server.ts');
    expect(triage).toContain('workshopPreviews');
  });
});
