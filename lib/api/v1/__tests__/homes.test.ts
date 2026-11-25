/**
 * `/api/v1/me/homes/*`, driven through the real developer-API wrapper and the site's real `favorite`,
 * `setFavoriteNote`, `setPriceAlerts`, `unfavorite` and `listWatches` over an in-memory RMH Homes database wrapped in
 * `shapeChecked`: the explicit scopes (and that no wildcard or default grant reaches them), the key owner's own rows
 * only, unavailable listings, no address, coordinates or `priceNoticeAt` in any response or `select`, keyset paging
 * and idempotent PUT and DELETE.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handlersOf, type TestHandler } from '@/lib/__tests__/api-handlers-of';

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- structural rows

const h = vi.hoisted(() => ({
  keyRow: { current: null as Record<string, unknown> | null },
  listings: [] as Record<string, any>[], // eslint-disable-line @typescript-eslint/no-explicit-any
  favs: [] as Record<string, any>[], // eslint-disable-line @typescript-eslint/no-explicit-any
  changes: [] as Record<string, any>[], // eslint-disable-line @typescript-eslint/no-explicit-any
  watches: [] as Record<string, any>[], // eslint-disable-line @typescript-eslint/no-explicit-any
  idem: new Map<string, Record<string, unknown>>(),
  blocked: [] as string[],
  selects: [] as unknown[],
  nextId: 1,
}));

/** `where` on a listing: id, moderatedAt and the `authorId` OR the route writes. */
function listingOk(l: Row, where: Row): boolean {
  if (where.id !== undefined && l.id !== where.id) return false;
  if (where.moderatedAt === null && l.moderatedAt !== null) return false;
  if (Array.isArray(where.OR)) {
    const ok = where.OR.some((c: Row) => {
      if (c.authorId === null) return l.authorId === null;
      if (c.authorId?.notIn) return !c.authorId.notIn.includes(l.authorId);
      return false;
    });
    if (!ok) return false;
  }
  return true;
}

function favOk(f: Row, where: Row): boolean {
  if (where.userId !== undefined && f.userId !== where.userId) return false;
  if (where.listingId !== undefined && f.listingId !== where.listingId) return false;
  if (Array.isArray(where.OR)) {
    const ok = where.OR.some((c: Row) => {
      if (c.createdAt?.lt) return f.createdAt < c.createdAt.lt;
      return f.createdAt.getTime() === c.createdAt.getTime() && f.id < c.id.lt;
    });
    if (!ok) return false;
  }
  return true;
}

function shapeFav(f: Row, select: Row) {
  const l = h.listings.find((x) => x.id === f.listingId) as Row;
  const spec = select.listing.select.priceChanges;
  const priceChanges = h.changes
    .filter((c) => c.listingId === l.id)
    .sort((a, b) => b.changedAt.getTime() - a.changedAt.getTime())
    .slice(0, spec.take)
    .map((c) => ({ oldCents: c.oldCents, newCents: c.newCents, changedAt: c.changedAt }));
  // Everything the database row has (and a careless `include` would return) is here; only the select reaches the API.
  const listing: Row = {};
  for (const k of Object.keys(select.listing.select)) if (k !== 'priceChanges') listing[k] = l[k];
  listing.priceChanges = priceChanges;
  const out: Row = { listing };
  for (const k of Object.keys(select)) if (k !== 'listing') out[k] = f[k];
  return out;
}

vi.mock('@/lib/prisma.server', async () => {
  const { shapeChecked } = await import('@/lib/db/query-shape');
  const prisma = {
    homeFavorite: {
      findMany: async (args: { where: Row; take: number; select: Row }) => {
        h.selects.push(args.select);
        return h.favs
          .filter((f) => favOk(f, args.where))
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || (a.id < b.id ? 1 : -1))
          .slice(0, args.take)
          .map((f) => shapeFav(f, args.select));
      },
      findUnique: async (args: { where: { userId_listingId: Row }; select: Row }) => {
        h.selects.push(args.select);
        const k = args.where.userId_listingId;
        const f = h.favs.find((x) => x.userId === k.userId && x.listingId === k.listingId);
        return f ? shapeFav(f, args.select) : null;
      },
      upsert: async ({ where, create }: { where: { userId_listingId: Row }; create: Row }) => {
        const k = where.userId_listingId;
        let f = h.favs.find((x) => x.userId === k.userId && x.listingId === k.listingId);
        if (!f) {
          f = {
            id: `fav${h.nextId++}`,
            createdAt: new Date(Date.UTC(2026, 10, 25, 12, 0, h.nextId)),
            priceAlerts: true,
            priceNoticeAt: null,
            note: null,
            ...create,
          };
          h.favs.push(f);
        }
        return f;
      },
      updateMany: async ({ where, data }: { where: Row; data: Row }) => {
        const rows = h.favs.filter((f) => favOk(f, where));
        for (const f of rows) Object.assign(f, data);
        return { count: rows.length };
      },
      deleteMany: async ({ where }: { where: Row }) => {
        const keep = h.favs.filter((f) => !favOk(f, where));
        const count = h.favs.length - keep.length;
        h.favs.splice(0, h.favs.length, ...keep);
        return { count };
      },
    },
    homeListing: {
      findFirst: async ({ where }: { where: Row }) => h.listings.find((l) => listingOk(l, where)) ?? null,
      findUnique: async ({ where }: { where: Row }) => h.listings.find((l) => listingOk(l, where)) ?? null,
    },
    homeWatch: {
      findMany: async ({ where }: { where: Row }) => h.watches.filter((w) => w.userId === where.userId),
    },
    developerApiKey: { findUnique: vi.fn(async () => h.keyRow.current), update: vi.fn(async () => ({})) },
    apiKeyRefusalDaily: { upsert: vi.fn(async () => ({})) },
    apiIdempotencyKey: {
      findUnique: vi.fn(
        async ({ where }: { where: { keyId_idempotency: { keyId: string; idempotency: string } } }) =>
          h.idem.get(where.keyId_idempotency.idempotency) ?? null,
      ),
      create: vi.fn(async ({ data }: { data: { idempotency: string } }) => {
        h.idem.set(data.idempotency, data);
        return {};
      }),
      deleteMany: vi.fn(async () => ({ count: 0 })),
    },
  };
  return { prisma: shapeChecked(prisma) };
});
vi.mock('@/lib/moderation.server', () => ({ getBlockedAuthorIds: vi.fn(async () => h.blocked) }));
vi.mock('@/lib/entitlements', () => ({ getUserTier: vi.fn(async () => 'starter'), hasApiAccess: () => true }));
vi.mock('@/lib/admin-audit.server', () => ({ getActiveBan: vi.fn(async () => null) }));
vi.mock('@/lib/redis.server', () => ({
  redisRateLimit: vi.fn(async () => null),
  redisIncrBy: vi.fn(async () => null),
}));
vi.mock('@/lib/api/usage.server', () => ({ recordUsage: vi.fn() }));
vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (config: unknown) => ({ options: config }),
}));

const routes = {
  saved: handlersOf<TestHandler>((await import('../../../../app/routes/api/v1/me/homes/saved')).Route),
  one: handlersOf<TestHandler>((await import('../../../../app/routes/api/v1/me/homes/saved/$listingId')).Route),
  searches: handlersOf<TestHandler>((await import('../../../../app/routes/api/v1/me/homes/searches')).Route),
};
const { assertJsonSafe } = await import('@/lib/db/query-shape');
const { KEY_PREFIX } = await import('@/lib/api/developer-auth.server');
const { DEFAULT_SCOPES } = await import('@/lib/api/scopes');
const { encodeSavedCursor, putSavedBody } = await import('@/lib/api/v1/homes-schema');

const OWNER = 'owner_1';
const BEARER = `Bearer ${KEY_PREFIX}${'k'.repeat(24)}`;
const BASE = '/api/v1/me/homes';

function key(scopes: string[]) {
  return {
    id: 'key_1',
    userId: OWNER,
    revokedAt: null,
    expiresAt: null,
    scopes,
    testMode: false,
    allowedCidrs: [] as string[],
    rateLimitPerMinute: null,
  };
}

async function call(
  handler: TestHandler | undefined,
  method: string,
  path: string,
  opts: { params?: Record<string, string>; body?: unknown; rawBody?: string; idem?: string } = {},
) {
  if (!handler) throw new Error(`no ${method} handler`);
  const hasBody = opts.body !== undefined || opts.rawBody !== undefined;
  const res = await handler({
    request: new Request(`https://rmhstudios.com${path}`, {
      method,
      headers: {
        authorization: BEARER,
        'cf-connecting-ip': '203.0.113.9',
        ...(hasBody ? { 'content-type': 'application/json' } : {}),
        ...(opts.idem ? { 'idempotency-key': opts.idem } : {}),
      },
      ...(hasBody ? { body: opts.rawBody ?? JSON.stringify(opts.body) } : {}),
    }),
    params: opts.params ?? {},
  });
  const json = await res
    .clone()
    .json()
    .catch(() => null);
  if (json) assertJsonSafe(json);
  return { res, json };
}

const listSaved = (q = '') => call(routes.saved.GET, 'GET', `${BASE}/saved${q}`);
const putSaved = (id: string, body?: unknown, idem?: string, rawBody?: string) =>
  call(routes.one.PUT, 'PUT', `${BASE}/saved/${id}`, {
    params: { listingId: id },
    ...(body === undefined ? {} : { body }),
    ...(rawBody === undefined ? {} : { rawBody }),
    ...(idem ? { idem } : {}),
  });
const delSaved = (id: string, idem?: string) =>
  call(routes.one.DELETE, 'DELETE', `${BASE}/saved/${id}`, { params: { listingId: id }, ...(idem ? { idem } : {}) });
const listSearches = () => call(routes.searches.GET, 'GET', `${BASE}/searches`);

/** A listing row as the database holds it: with the address and coordinates the API must never return. */
const listing = (id: string, over: Row = {}): Row => ({
  id,
  authorId: 'author_1',
  title: `Home ${id}`,
  listingType: 'RENT',
  propertyType: 'APARTMENT',
  priceCents: 135000,
  beds: 2,
  baths: 1,
  sqft: 820,
  city: 'Rochester',
  state: 'NY',
  status: 'ACTIVE',
  address: '12 Secret Street',
  lat: 43.1566,
  lng: -77.6088,
  moderatedAt: null,
  ...over,
});

const fav = (id: string, listingId: string, userId: string, mins: number, over: Row = {}): Row => ({
  id,
  userId,
  listingId,
  createdAt: new Date(Date.UTC(2026, 10, 20, 10, mins, 0)),
  priceAlerts: true,
  priceNoticeAt: new Date('2026-11-21T00:00:00Z'),
  note: null,
  ...over,
});

function seed() {
  h.listings.push(
    listing('l1'),
    listing('l2', { authorId: null, priceCents: 250000, sqft: null }),
    listing('lMod', { moderatedAt: new Date('2026-11-22T00:00:00Z') }),
    listing('lBlocked', { authorId: 'blocked_author' }),
    listing('lOther'),
  );
  h.favs.push(
    fav('f1', 'l1', OWNER, 1, { note: 'Quiet street.' }),
    fav('f2', 'l2', OWNER, 2),
    fav('f3', 'lMod', OWNER, 3, { note: 'Kept note.' }),
    fav('f4', 'lBlocked', OWNER, 4),
    fav('fOther', 'lOther', 'other_member', 5, { note: 'Not yours.' }),
  );
  for (let i = 0; i < 12; i++) {
    h.changes.push({
      id: `c${i}`,
      listingId: 'l1',
      oldCents: 100000 + i,
      newCents: 99000 + i,
      source: 'author',
      changedAt: new Date(Date.UTC(2026, 9, 1 + i)),
    });
  }
  h.changes.push({
    id: 'cMod',
    listingId: 'lMod',
    oldCents: 1,
    newCents: 2,
    source: 'feed',
    changedAt: new Date('2026-11-01T00:00:00Z'),
  });
  h.watches.push(
    {
      id: 'w1',
      userId: OWNER,
      label: 'Two beds',
      listingType: 'RENT',
      propertyTypes: ['APARTMENT'],
      locationLabel: 'Rochester, NY',
      lat: 43.1566,
      lng: -77.6088,
      radiusKm: 8,
      minPriceCents: 90000,
      maxPriceCents: 150000,
      minBeds: 2,
      minBaths: 1,
      petsRequired: true,
      active: true,
      lastNotifiedAt: null,
      createdAt: new Date('2026-11-10T09:00:00Z'),
    },
    {
      id: 'wOther',
      userId: 'other_member',
      label: 'Not yours',
      listingType: null,
      propertyTypes: [],
      locationLabel: null,
      lat: 1,
      lng: 2,
      radiusKm: null,
      minPriceCents: null,
      maxPriceCents: null,
      minBeds: null,
      minBaths: null,
      petsRequired: false,
      active: true,
      lastNotifiedAt: null,
      createdAt: new Date('2026-11-11T09:00:00Z'),
    },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  h.listings.length = 0;
  h.favs.length = 0;
  h.changes.length = 0;
  h.watches.length = 0;
  h.idem.clear();
  h.selects.length = 0;
  h.blocked = ['blocked_author'];
  h.nextId = 1;
  seed();
  h.keyRow.current = key(['read:homes', 'write:homes']);
});

const NEVER = /\b(lat|lng|address|priceNoticeAt|authorId|moderatedAt|postalCode|description|images)\b/;
function keysOf(v: unknown, out: string[] = []): string[] {
  if (Array.isArray(v)) v.forEach((x) => keysOf(x, out));
  else if (v && typeof v === 'object')
    for (const [k, x] of Object.entries(v)) {
      out.push(k);
      keysOf(x, out);
    }
  return out;
}

describe('scopes', () => {
  const calls = [() => listSaved(), () => putSaved('l1', { note: 'x' }), () => delSaved('l1'), () => listSearches()];

  it.each([['*'], ['read:*'], ['write:*'], ['read:*', 'write:*', 'manage:*'], DEFAULT_SCOPES])(
    'a key with only %s cannot reach RMH Homes (403 insufficient_scope) and nothing is written',
    async (...scopes) => {
      h.keyRow.current = key(scopes.flat());
      for (const run of calls) {
        const { res, json } = await run();
        expect(res.status).toBe(403);
        expect(json?.error.code).toBe('insufficient_scope');
      }
      expect(h.favs).toHaveLength(5);
      expect(h.favs.find((f) => f.id === 'f1')?.note).toBe('Quiet street.');
    },
  );

  it('read:homes reads and cannot write; write:homes writes and cannot read', async () => {
    h.keyRow.current = key(['read:homes']);
    expect((await listSaved()).res.status).toBe(200);
    expect((await listSearches()).res.status).toBe(200);
    expect((await putSaved('l2', { note: 'x' })).res.status).toBe(403);
    expect((await delSaved('l1')).res.status).toBe(403);
    expect(h.favs).toHaveLength(5);
    h.keyRow.current = key(['write:homes']);
    expect((await listSaved()).res.status).toBe(403);
    expect((await listSearches()).res.status).toBe(403);
    expect((await putSaved('l1', { priceAlerts: false })).res.status).toBe(200);
  });
});

describe('saved homes', () => {
  it('lists the key owner’s saved homes newest first with note, alert and the newest ten price changes', async () => {
    const { res, json } = await listSaved();
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('private, no-store');
    expect(json?.data.map((s: Row) => s.listingId)).toEqual(['lBlocked', 'lMod', 'l2', 'l1']);
    const one = json?.data.find((s: Row) => s.listingId === 'l1');
    expect(one).toMatchObject({
      note: 'Quiet street.',
      priceAlerts: true,
      listing: {
        title: 'Home l1',
        listingType: 'RENT',
        propertyType: 'APARTMENT',
        priceCents: 135000,
        beds: 2,
        baths: 1,
        sqft: 820,
        city: 'Rochester',
        state: 'NY',
        status: 'ACTIVE',
        url: 'https://rmhstudios.com/homes/listing/l1',
        available: true,
      },
    });
    expect(one.priceChanges).toHaveLength(10);
    // newest first: the twelve changes run from 1 October (i = 0) to 12 October (i = 11)
    expect(one.priceChanges[0]).toEqual({
      oldCents: 100011,
      newCents: 99011,
      changedAt: '2026-10-12T00:00:00.000Z',
    });
    expect(one.priceChanges[9].changedAt).toBe('2026-10-03T00:00:00.000Z');
    expect(json?.data.find((s: Row) => s.listingId === 'l2').listing.sqft).toBeNull();
  });

  it('never returns another member’s saved home, note or id', async () => {
    const { json } = await listSaved();
    const text = JSON.stringify(json);
    expect(text).not.toContain('lOther');
    expect(text).not.toContain('Not yours');
    expect(text).not.toContain('other_member');
  });

  it('reads a listing a moderator removed, or by an author blocked either way, as unavailable with figures null', async () => {
    const { json } = await listSaved();
    for (const id of ['lMod', 'lBlocked']) {
      const row = json?.data.find((s: Row) => s.listingId === id);
      expect(row.listing).toEqual({
        title: null,
        listingType: null,
        propertyType: null,
        priceCents: null,
        beds: null,
        baths: null,
        sqft: null,
        city: null,
        state: null,
        status: null,
        url: `https://rmhstudios.com/homes/listing/${id}`,
        available: false,
      });
      expect(row.priceChanges).toEqual([]);
    }
    // the saved row and the note stay
    expect(json?.data.find((s: Row) => s.listingId === 'lMod').note).toBe('Kept note.');
    // a scraped listing has no author and is never blocked
    expect(json?.data.find((s: Row) => s.listingId === 'l2').listing.available).toBe(true);
  });

  it('has no coordinates, address or priceNoticeAt in a response and never selects them', async () => {
    const { json } = await listSaved();
    expect(keysOf(json).filter((k) => NEVER.test(k))).toEqual([]);
    expect(JSON.stringify(json)).not.toContain('Secret Street');
    expect(JSON.stringify(json)).not.toContain('2026-11-21T00:00:00');
    const put = await putSaved('l1', { note: 'again' });
    expect(keysOf(put.json).filter((k) => NEVER.test(k))).toEqual([]);
    for (const select of h.selects as Row[]) {
      expect(Object.keys(select)).not.toContain('priceNoticeAt');
      expect(Object.keys(select.listing.select).filter((k) => /^(lat|lng|address|postalCode)$/.test(k))).toEqual([]);
    }
  });

  it('pages with an opaque keyset cursor and refuses a bad one', async () => {
    const first = await listSaved('?limit=3');
    expect(first.json?.data.map((s: Row) => s.listingId)).toEqual(['lBlocked', 'lMod', 'l2']);
    expect(first.json?.nextCursor).toEqual(expect.any(String));
    const second = await listSaved(`?limit=3&cursor=${encodeURIComponent(first.json?.nextCursor)}`);
    expect(second.json?.data.map((s: Row) => s.listingId)).toEqual(['l1']);
    expect(second.json?.nextCursor).toBeNull();
    expect((await listSaved('?cursor=!!!')).res.status).toBe(400);
    expect((await listSaved(`?cursor=${encodeSavedCursor({ ms: Number.NaN, id: 'x' })}`)).res.status).toBe(400);
    expect((await listSaved('?limit=0')).res.status).toBe(400);
    expect((await listSaved('?limit=51')).res.status).toBe(400);
  });

  it('breaks a tie on createdAt with the row id', async () => {
    h.favs.push(fav('f1b', 'l2', OWNER, 1));
    const a = await listSaved('?limit=50');
    const ids = a.json?.data.map((s: Row) => s.listingId);
    expect(ids.slice(-2)).toEqual(['l2', 'l1']);
    const cursor = encodeSavedCursor({ ms: new Date(Date.UTC(2026, 10, 20, 10, 1, 0)).getTime(), id: 'f1b' });
    expect((await listSaved(`?cursor=${cursor}`)).json?.data.map((s: Row) => s.listingId)).toEqual(['l1']);
  });
});

describe('PUT and DELETE', () => {
  it('saves a home with a note and the alert, and the site reads the same note', async () => {
    const { res, json } = await putSaved('lOther', { note: '  Ask about parking.  ', priceAlerts: false });
    expect(res.status).toBe(200);
    expect(json?.data).toMatchObject({
      listingId: 'lOther',
      note: 'Ask about parking.',
      priceAlerts: false,
      listing: { available: true, title: 'Home lOther' },
    });
    const row = h.favs.find((f) => f.userId === OWNER && f.listingId === 'lOther');
    expect(row).toMatchObject({ note: 'Ask about parking.', priceAlerts: false });
    // the other member's row is untouched
    expect(h.favs.find((f) => f.id === 'fOther')).toMatchObject({ note: 'Not yours.', priceAlerts: true });
  });

  it('is idempotent: a second PUT keeps one row, an absent field keeps its value, null clears the note', async () => {
    await putSaved('l1', { priceAlerts: false });
    expect(h.favs.filter((f) => f.userId === OWNER && f.listingId === 'l1')).toHaveLength(1);
    expect(h.favs.find((f) => f.id === 'f1')).toMatchObject({ note: 'Quiet street.', priceAlerts: false });
    await putSaved('l1', {});
    expect(h.favs.find((f) => f.id === 'f1')).toMatchObject({ note: 'Quiet street.', priceAlerts: false });
    expect((await putSaved('l1', { note: null })).json?.data.note).toBeNull();
    expect((await putSaved('l1', { note: 'x' })).json?.data.note).toBe('x');
    expect((await putSaved('l1', { note: '   ' })).json?.data.note).toBeNull();
    expect(h.favs.filter((f) => f.userId === OWNER && f.listingId === 'l1')).toHaveLength(1);
  });

  it('saves with no body at all, with the alert on by default', async () => {
    const { res, json } = await putSaved('lOther');
    expect(res.status).toBe(200);
    expect(json?.data).toMatchObject({ listingId: 'lOther', note: null, priceAlerts: true });
    expect((await putSaved('lOther', undefined, undefined, '   ')).res.status).toBe(200);
  });

  it('replays an Idempotency-Key without acting twice', async () => {
    const first = await putSaved('lOther', { note: 'first' }, 'idem-1');
    expect(first.res.status).toBe(200);
    h.favs.find((f) => f.userId === OWNER && f.listingId === 'lOther')!.note = 'changed elsewhere';
    const again = await putSaved('lOther', { note: 'first' }, 'idem-1');
    expect(again.res.status).toBe(200);
    expect(h.favs.find((f) => f.userId === OWNER && f.listingId === 'lOther')?.note).toBe('changed elsewhere');
  });

  it('answers 404 for a listing that is missing, removed by a moderator or by an author blocked either way, and saves nothing', async () => {
    for (const id of ['nope', 'lMod', 'lBlocked']) {
      const { res, json } = await putSaved(id, { note: 'x' });
      expect(res.status).toBe(404);
      expect(json?.error.code).toBe('not_found');
    }
    expect(h.favs.filter((f) => f.userId === OWNER)).toHaveLength(4);
    expect(h.favs.find((f) => f.id === 'f3')?.note).toBe('Kept note.');
  });

  it('refuses a bad body: a note over 1,000 characters, an unknown field, a wrong type, bad JSON', async () => {
    expect((await putSaved('l1', { note: 'x'.repeat(1001) })).res.status).toBe(400);
    expect((await putSaved('l1', { note: 'x'.repeat(1000) })).res.status).toBe(200);
    expect((await putSaved('l1', { lat: 1 })).res.status).toBe(400);
    expect((await putSaved('l1', { priceAlerts: 'yes' })).res.status).toBe(400);
    expect((await putSaved('l1', undefined, undefined, '{nope')).res.status).toBe(400);
    expect(putSavedBody.safeParse({ note: '' }).data).toEqual({ note: null });
  });

  it('unsaves through DELETE, only the key owner’s row, and again with nothing to remove', async () => {
    const first = await delSaved('l1');
    expect(first.res.status).toBe(204);
    expect(first.res.headers.get('cache-control')).toBe('private, no-store');
    expect(h.favs.find((f) => f.id === 'f1')).toBeUndefined();
    expect((await delSaved('l1')).res.status).toBe(204);
    expect((await delSaved('nope')).res.status).toBe(204);
    // another member's save of the same listing id is never touched
    h.favs.push(fav('fSame', 'l1', 'other_member', 9, { note: 'theirs' }));
    expect((await delSaved('l1')).res.status).toBe(204);
    expect(h.favs.find((f) => f.id === 'fSame')?.note).toBe('theirs');
    expect(h.favs.find((f) => f.id === 'fOther')).toBeDefined();
  });

  it('can unsave a listing that is no longer available', async () => {
    expect((await delSaved('lMod')).res.status).toBe(204);
    expect(h.favs.find((f) => f.id === 'f3')).toBeUndefined();
  });
});

describe('saved searches', () => {
  it('lists the key owner’s searches without coordinates', async () => {
    const { res, json } = await listSearches();
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('private, no-store');
    expect(json?.data).toEqual([
      {
        id: 'w1',
        label: 'Two beds',
        listingType: 'RENT',
        propertyTypes: ['APARTMENT'],
        locationLabel: 'Rochester, NY',
        radiusKm: 8,
        minPriceCents: 90000,
        maxPriceCents: 150000,
        minBeds: 2,
        minBaths: 1,
        petsRequired: true,
        active: true,
        createdAt: '2026-11-10T09:00:00.000Z',
      },
    ]);
    expect(keysOf(json).filter((k) => /^(lat|lng|userId|lastNotifiedAt|updatedAt)$/.test(k))).toEqual([]);
    expect(JSON.stringify(json)).not.toContain('43.1566');
    expect(JSON.stringify(json)).not.toContain('Not yours');
  });
});
