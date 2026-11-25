import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handlersOfModule } from '@/lib/__tests__/api-handlers-of';
import { DEFAULT_FILTERS } from '@/lib/homes/types';

/**
 * s12-16: a community listing a moderator removed has status REMOVED and a `moderatedAt` stamp. Its author cannot set
 * any other status (the PATCH answers a 409 with `CONTENT_REMOVED_BY_MODERATOR`) but still sees it, told it was
 * removed; everyone else gets a 404 from `getListing`; browse and the map, saved lists, comparisons, saving it and
 * price-drop notices all leave it out. A scraped listing has no member author and is never removed this way.
 */

type Row = Record<string, unknown>;
const h = vi.hoisted(() => ({
  listings: [] as Row[],
  browseWhere: null as Row | null,
  favWhere: [] as Row[],
  dropWhere: null as Row | null,
}));

const matches = (row: Row, where: Row): boolean =>
  Object.entries(where).every(([k, v]) => {
    if (v && typeof v === 'object' && !Array.isArray(v) && 'not' in (v as Row)) return row[k] !== (v as Row).not;
    return row[k] === v;
  });

const listing = (over: Row): Row => ({
  id: 'l1',
  authorId: 'owner',
  source: 'COMMUNITY',
  status: 'ACTIVE',
  listingType: 'RENT',
  propertyType: 'APARTMENT',
  title: 'Flat',
  description: 'A flat',
  priceCents: 150000,
  beds: 1,
  baths: 1,
  sqft: null,
  address: null,
  city: 'Rochester',
  state: 'NY',
  postalCode: null,
  lat: 43.1,
  lng: -77.6,
  amenities: [],
  petsAllowed: false,
  availableFrom: null,
  images: [],
  aiImages: [],
  imageAlts: [],
  viewsCount: 0,
  externalUrl: null,
  sourceName: null,
  priceDroppedAt: null,
  moderatedAt: null,
  createdAt: new Date('2026-12-01'),
  updatedAt: new Date('2026-12-01'),
  author: { id: 'owner', name: 'O', image: null, handle: 'o', username: null },
  favorites: [],
  ...over,
});

vi.mock('@/lib/prisma.server', () => ({
  prisma: {
    homeListing: {
      findUnique: vi.fn(async ({ where }: { where: Row }) => h.listings.find((r) => matches(r, where)) ?? null),
      findFirst: vi.fn(async ({ where }: { where: Row }) => h.listings.find((r) => matches(r, where)) ?? null),
      findMany: vi.fn(async ({ where }: { where: Row }) => {
        h.browseWhere = where;
        return h.listings.filter((r) => matches(r, { status: where.status, moderatedAt: where.moderatedAt }));
      }),
      update: vi.fn(async () => ({})),
      updateMany: vi.fn(async ({ where, data }: { where: Row; data: Row }) => {
        const hit = h.listings.filter((r) => matches(r, where));
        for (const r of hit) Object.assign(r, data);
        return { count: hit.length };
      }),
    },
    homeFavorite: {
      findMany: vi.fn(async ({ where }: { where: Row }) => {
        h.favWhere.push(where);
        return [];
      }),
      upsert: vi.fn(async () => ({})),
    },
  },
}));
vi.mock('@/lib/api/handler.server', () => ({ defineHandler: (_o: unknown, fn: unknown) => fn }));
vi.mock('@/lib/api/implement.server', () => ({ implement: (_c: unknown, _o: unknown, fn: unknown) => fn }));
vi.mock('@/lib/homes/geo.server', () => ({ resolveCenter: vi.fn(async () => null) }));

import {
  browseListings,
  compareFavorites,
  favorite,
  getListing,
  listFavorites,
  moderateListing,
  setListingStatus,
} from '@/lib/homes/listings.server';
import { notifyPriceDrop } from '@/lib/homes/price-drop-notify.server';

type Handler = (a: Record<string, unknown>) => Promise<Response>;

beforeEach(() => {
  h.listings = [listing({})];
  h.browseWhere = null;
  h.favWhere = [];
  h.dropWhere = null;
});

describe('a removed listing and its author', () => {
  it('cannot be set back to active, rented or sold; "removed" is still accepted', async () => {
    await moderateListing('l1');
    expect(h.listings[0]).toMatchObject({ status: 'REMOVED', moderatedAt: expect.any(Date) });
    for (const status of ['ACTIVE', 'RENTED', 'SOLD'] as const) {
      expect(await setListingStatus('l1', 'owner', status)).toBe('moderated');
    }
    expect(h.listings[0]).toMatchObject({ status: 'REMOVED' });
    expect(await setListingStatus('l1', 'owner', 'REMOVED')).toBe(true);
  });

  it('is told so by the PATCH route (409 with the refusal code), and the listing stays removed', async () => {
    await moderateListing('l1');
    const mod = await import('@/lib/homes/api/homes.listings.$id.server');
    const res = await handlersOfModule<Handler>(mod).PATCH!({
      request: new Request('http://x/api/homes/listings/l1', {
        method: 'PATCH',
        body: JSON.stringify({ status: 'ACTIVE' }),
      }),
      params: { id: 'l1' },
      session: { user: { id: 'owner' } },
    });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: 'CONTENT_REMOVED_BY_MODERATOR' });
    expect(h.listings[0]).toMatchObject({ status: 'REMOVED' });
  });

  it('keeps ordinary status changes for a listing that was not removed', async () => {
    expect(await setListingStatus('l1', 'owner', 'RENTED')).toBe(true);
    expect(await setListingStatus('l1', 'owner', 'ACTIVE')).toBe(true);
    expect(await setListingStatus('l1', 'stranger', 'ACTIVE')).toBe(false);
  });

  it('still sees the listing, flagged as removed by a moderator', async () => {
    await moderateListing('l1');
    const mine = await getListing('l1', 'owner', false);
    expect(mine).toMatchObject({ id: 'l1', isOwner: true, removedByModerator: true });
  });
});

describe('everyone else', () => {
  it('gets nothing from getListing, signed in or out', async () => {
    expect(await getListing('l1', 'stranger', false)).toMatchObject({ id: 'l1' });
    await moderateListing('l1');
    expect(await getListing('l1', 'stranger', false)).toBeNull();
    expect(await getListing('l1', null, false)).toBeNull();
  });

  it('does not browse it (nor map it: the map reads the same query)', async () => {
    await moderateListing('l1');
    const res = await browseListings({ ...DEFAULT_FILTERS }, 'stranger');
    expect(h.browseWhere).toMatchObject({ status: 'ACTIVE', moderatedAt: null });
    expect(res.listings).toEqual([]);
  });

  it('does not list it among saved homes or compare it, and cannot save it', async () => {
    await listFavorites('stranger');
    await compareFavorites('stranger', ['l1']);
    expect(h.favWhere).toHaveLength(2);
    for (const where of h.favWhere) expect(where).toMatchObject({ listing: { moderatedAt: null } });
    await moderateListing('l1');
    expect(await favorite('stranger', 'l1')).toBe(false);
  });

  it('is told of no price drop on a listing that is not live and unmoderated', async () => {
    const findMany = vi.fn(async (args: { where: Row }) => {
      h.dropWhere = args.where;
      return [];
    });
    await notifyPriceDrop(
      {
        prisma: { homeFavorite: { findMany, updateMany: vi.fn() }, userBlock: { findMany: vi.fn() } } as never,
        deliver: vi.fn(),
      },
      { listingId: 'l1', authorId: 'owner', title: 't', city: 'c', state: 's', oldCents: 200, newCents: 100 },
    );
    expect(h.dropWhere).toMatchObject({ listing: { status: 'ACTIVE', moderatedAt: null } });
  });
});

describe('a scraped listing', () => {
  it('is not removed by the member-report takedown', async () => {
    h.listings = [listing({ id: 'x1', source: 'EXTERNAL', authorId: null, author: null })];
    expect(await moderateListing('x1')).toBe(false);
    expect(h.listings[0]).toMatchObject({ status: 'ACTIVE', moderatedAt: null });
  });
});
