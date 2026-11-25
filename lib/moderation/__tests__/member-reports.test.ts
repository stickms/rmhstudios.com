import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handlersOfModule } from '@/lib/__tests__/api-handlers-of';
import {
  MEMBER_ITEM_REPORT_TYPES,
  REMOVABLE_REPORT_ENTITY_TYPES,
  REPORT_ENTITY_TYPES,
} from '@/lib/moderation/report-constants';

/**
 * s12-16: a Connections grid, a public flashcard deck, a public AI persona and a community home listing go through the
 * report flow as `connections-grid`, `study-deck`, `persona` and `home-listing`. Each resolves the member who made it,
 * is refused for its own author, for a private or already removed item and for a scraped listing, and each takedown
 * leaves the item non-public. The route and the takedown run against a small in-memory database.
 */

type Row = Record<string, unknown>;
const h = vi.hoisted(() => ({
  grids: [] as Row[],
  decks: [] as Row[],
  personas: [] as Row[],
  listings: [] as Row[],
  reports: [] as Row[],
}));

const matches = (row: Row, where: Row): boolean =>
  Object.entries(where).every(([k, v]) => {
    if (v && typeof v === 'object' && !Array.isArray(v) && 'not' in (v as Row)) return row[k] !== (v as Row).not;
    return row[k] === v;
  });
const model = (rows: () => Row[]) => ({
  findUnique: vi.fn(async ({ where }: { where: Row }) => rows().find((r) => matches(r, where)) ?? null),
  updateMany: vi.fn(async ({ where, data }: { where: Row; data: Row }) => {
    const hit = rows().filter((r) => matches(r, where));
    for (const r of hit) Object.assign(r, data);
    return { count: hit.length };
  }),
});

vi.mock('@/lib/prisma.server', () => ({
  prisma: {
    connectionsGrid: model(() => h.grids),
    flashcardDeck: model(() => h.decks),
    aiPersona: model(() => h.personas),
    homeListing: model(() => h.listings),
    contentReport: {
      findFirst: vi.fn(async () => null),
      create: vi.fn(async ({ data }: { data: Row }) => {
        h.reports.push(data);
        return data;
      }),
    },
  },
}));
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
  h.grids = [{ id: 'g1', authorId: 'u1', draft: false, hidden: false, title: 'Grid' }];
  h.decks = [
    { id: 'd1', userId: 'u1', isPublic: true, moderatedAt: null, title: 'Deck' },
    { id: 'd2', userId: 'u1', isPublic: false, moderatedAt: null, title: 'Private deck' },
  ];
  h.personas = [{ id: 'p1', ownerId: 'u1', isPublic: true, moderatedAt: null, name: 'Persona' }];
  h.listings = [
    { id: 'l1', authorId: 'u1', source: 'COMMUNITY', status: 'ACTIVE', moderatedAt: null, title: 'Listing' },
    { id: 'l2', authorId: null, source: 'EXTERNAL', status: 'ACTIVE', moderatedAt: null, title: 'Scraped' },
  ];
  h.reports = [];
});

const CASES = [
  ['connections-grid', 'g1'],
  ['study-deck', 'd1'],
  ['persona', 'p1'],
  ['home-listing', 'l1'],
] as const;

describe('the four types', () => {
  it('are reportable, removable and held to the member-item rule', () => {
    for (const [type] of CASES) {
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

  it.each(CASES)('%s: its own author cannot report it', async (type, id) => {
    const res = await report('u1', type, id);
    expect(res.status).toBe(403);
    expect(h.reports).toHaveLength(0);
  });

  it.each(CASES)('%s: a missing item is a 404', async (type) => {
    const res = await report('reporter', type, 'nope');
    expect(res.status).toBe(404);
    expect(h.reports).toHaveLength(0);
  });

  it('a private deck is a 404, as a missing one is', async () => {
    expect((await report('reporter', 'study-deck', 'd2')).status).toBe(404);
    expect(h.reports).toHaveLength(0);
  });

  it('a scraped listing has no member author and is refused', async () => {
    expect((await report('reporter', 'home-listing', 'l2')).status).toBe(404);
    expect(h.reports).toHaveLength(0);
  });

  it.each([
    ['study-deck', 'd1', 'decks'],
    ['persona', 'p1', 'personas'],
    ['home-listing', 'l1', 'listings'],
  ] as const)('%s: an item already taken down cannot be reported into a second takedown', async (type, id, store) => {
    (h[store].find((r) => r.id === id) as Row).moderatedAt = new Date();
    expect((await report('reporter', type, id)).status).toBe(404);
    expect(h.reports).toHaveLength(0);
  });

  it('a hidden or draft grid is refused', async () => {
    h.grids[0]!.draft = true;
    expect((await report('reporter', 'connections-grid', 'g1')).status).toBe(404);
    h.grids[0]!.draft = false;
    h.grids[0]!.hidden = true;
    expect((await report('reporter', 'connections-grid', 'g1')).status).toBe(404);
  });
});

describe('the takedown', () => {
  it('hides a grid', async () => {
    const { hideGridForReport } = await import('@/lib/party/connections.server');
    await hideGridForReport('g1');
    expect(h.grids[0]).toMatchObject({ hidden: true });
    await hideGridForReport('g1');
    expect(h.grids[0]).toMatchObject({ hidden: true });
  });

  it('makes a deck private and stamps it', async () => {
    const { moderateDeck } = await import('@/lib/study/deck-moderation.server');
    expect(await moderateDeck('d1')).toBe(true);
    expect(h.decks[0]).toMatchObject({ isPublic: false, moderatedAt: expect.any(Date) });
    expect(await moderateDeck('d1')).toBe(false);
  });

  it('makes a persona private and stamps it', async () => {
    const { moderatePersona } = await import('@/lib/personas/moderation.server');
    expect(await moderatePersona('p1')).toBe(true);
    expect(h.personas[0]).toMatchObject({ isPublic: false, moderatedAt: expect.any(Date) });
  });

  it('removes a community listing and stamps it, and leaves a scraped one alone', async () => {
    const { moderateListing } = await import('@/lib/homes/listings.server');
    expect(await moderateListing('l1')).toBe(true);
    expect(h.listings[0]).toMatchObject({ status: 'REMOVED', moderatedAt: expect.any(Date) });
    expect(await moderateListing('l2')).toBe(false);
    expect(h.listings[1]).toMatchObject({ status: 'ACTIVE', moderatedAt: null });
  });
});

describe('the admin queue and "Your reports"', () => {
  const root = join(__dirname, '..', '..', '..');
  const read = (p: string) => readFileSync(join(root, p), 'utf8');

  it('dispatches each takedown and shows each title (the persona with its system prompt)', () => {
    const triage = read('lib/moderation/triage.server.ts');
    const takedown = triage.slice(triage.indexOf('async function takedownReportedContent'));
    for (const call of [
      'hideGridForReport(entityId)',
      'moderateDeck(entityId',
      'moderatePersona(entityId',
      'moderateListing(entityId',
    ]) {
      expect(takedown).toContain(call);
    }
    for (const [type] of CASES) expect(triage).toContain(`groupKey('${type}', id)`);
    expect(triage).toContain('personaReportTexts');
    expect(triage).toContain('p.systemPrompt');
  });

  it('shows the reporter each kind and its "gone" line', () => {
    const panel = read('components/moderation/MyReportsPanel.tsx');
    for (const [type] of CASES) {
      expect(panel).toContain(`t('kind-${type}'`);
      expect(panel).toContain(`t('gone-${type}'`);
    }
    const mine = read('lib/moderation/my-reports.server.ts');
    for (const [type] of CASES) expect(mine).toContain(`set('${type}'`);
  });

  it('never gives a reporter the persona prompt', () => {
    expect(read('lib/moderation/my-reports.server.ts')).not.toContain('systemPrompt');
  });
});
