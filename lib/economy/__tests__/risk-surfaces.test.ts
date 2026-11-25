import { beforeEach, describe, expect, it, vi } from 'vitest';

// Self-exclusion hides the coin games (W8). The server half: the one-bit signal the menus read, and the page check the
// risk surfaces' loaders run. Only self-exclusion hides; a cool-off and an expired exclusion do not. The Prisma fake
// is schema-checked, so a query shape Postgres would refuse throws here too.

const h = vi.hoisted(() => ({
  session: null as { user: { id: string } } | null,
  rows: new Map<string, { selfExcludedUntil: Date | null; coolOffUntil: Date | null }>(),
  findUnique: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: vi.fn(async () => h.session) } } }));
vi.mock('@/lib/prisma.server', async () => ({
  prisma: (await import('@/lib/db/query-shape')).shapeChecked({
    userPlayLimits: { findUnique: h.findUnique },
  }),
}));

import { assertJsonSafe } from '@/lib/db/query-shape';
import { readExclusionNotice } from '@/lib/economy/exclusion-page.server';
import { route } from '@/lib/economy/api/settings.play-limits.surfaces.server';

const DAY = 24 * 60 * 60 * 1000;
const now = new Date('2026-12-01T12:00:00Z');
const inDays = (n: number) => new Date(now.getTime() + n * DAY);

type Handlers = Record<string, (a: { request: Request; params: Record<string, string> }) => Promise<Response>>;
const get = (signedCookie = true) =>
  (route.handlers as Handlers).GET!({
    request: new Request('https://rmhstudios.com/api/settings/play-limits/surfaces', {
      headers: {
        'cf-connecting-ip': `${Math.random()}`,
        ...(signedCookie ? { cookie: 'better-auth.session_token=test-session-1' } : {}),
      },
    }),
    params: {},
  });

beforeEach(() => {
  h.session = { user: { id: 'me' } };
  h.rows = new Map();
  h.findUnique.mockReset();
  h.findUnique.mockImplementation(async ({ where }: { where: { userId: string } }) => {
    const row = h.rows.get(where.userId);
    return row ? { selfExcludedUntil: row.selfExcludedUntil } : null;
  });
});

describe('GET /api/settings/play-limits/surfaces', () => {
  it('says hidden while the member is self-excluded, and nothing else', async () => {
    h.rows.set('me', { selfExcludedUntil: new Date(Date.now() + 7 * DAY), coolOffUntil: null });
    const res = await get();
    expect(res.status).toBe(200);
    const body = await res.json();
    assertJsonSafe(body);
    expect(body).toEqual({ hidden: true });
  });

  it('does not hide anything for a cool-off', async () => {
    h.rows.set('me', { selfExcludedUntil: null, coolOffUntil: new Date(Date.now() + 7 * DAY) });
    expect(await (await get()).json()).toEqual({ hidden: false });
  });

  it('does not hide anything once the exclusion has ended', async () => {
    h.rows.set('me', { selfExcludedUntil: new Date(Date.now() - 1000), coolOffUntil: null });
    expect(await (await get()).json()).toEqual({ hidden: false });
  });

  it('does not hide anything for a member with no limits row', async () => {
    expect(await (await get()).json()).toEqual({ hidden: false });
  });

  it('answers false to a signed-out caller without touching the database', async () => {
    h.session = null;
    const res = await get(false);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ hidden: false });
    expect(h.findUnique).not.toHaveBeenCalled();
  });

  it('is private and brief: the answer follows the member', async () => {
    const res = await get();
    expect(res.headers.get('cache-control')).toContain('private');
    expect(res.headers.get('cache-control')).toContain('max-age=60');
  });
});

describe('readExclusionNotice (the page check)', () => {
  it('names the end of an exclusion', async () => {
    h.rows.set('me', { selfExcludedUntil: inDays(7), coolOffUntil: null });
    expect(await readExclusionNotice('me', now)).toEqual({ excluded: true, until: inDays(7).toISOString() });
  });

  it('is not excluded in a cool-off', async () => {
    h.rows.set('me', { selfExcludedUntil: null, coolOffUntil: inDays(7) });
    expect(await readExclusionNotice('me', now)).toEqual({ excluded: false });
  });

  it('is not excluded once the exclusion has ended, or exactly as it ends', async () => {
    h.rows.set('me', { selfExcludedUntil: inDays(-1), coolOffUntil: null });
    expect(await readExclusionNotice('me', now)).toEqual({ excluded: false });
    h.rows.set('me', { selfExcludedUntil: now, coolOffUntil: null });
    expect(await readExclusionNotice('me', now)).toEqual({ excluded: false });
  });

  it('is not excluded without a row, and never for a signed-out viewer', async () => {
    expect(await readExclusionNotice('someone-else', now)).toEqual({ excluded: false });
    h.findUnique.mockClear();
    expect(await readExclusionNotice(null, now)).toEqual({ excluded: false });
    expect(h.findUnique).not.toHaveBeenCalled();
  });

  it('reads one member row by userId and selects only the end date', async () => {
    await readExclusionNotice('me', now);
    expect(h.findUnique).toHaveBeenCalledWith({ where: { userId: 'me' }, select: { selfExcludedUntil: true } });
  });
});
