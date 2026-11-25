import { beforeEach, describe, expect, it, vi } from 'vitest';

// Private notes on saved homes (s12 10): a note is written only on the caller's own favourite row (404 otherwise),
// it is in nobody else's read of the listing, unsaving deletes the row (and the note with it), and it is held to
// 1000 characters.

interface FavRow {
  id: string;
  userId: string;
  listingId: string;
  createdAt: Date;
  priceAlerts: boolean;
  priceNoticeAt: Date | null;
  note: string | null;
}

const h = vi.hoisted(() => ({
  favorites: [] as FavRow[],
  updateMany: vi.fn(async (_a: unknown) => ({ count: 0 })),
  deleteMany: vi.fn(async (_a: unknown) => ({ count: 1 })),
  findMany: vi.fn(async (_a: unknown) => [] as unknown[]),
  findUnique: vi.fn(async (a: { where: { id: string }; include?: { favorites?: { where: { userId: string } } } }) => {
    const only = a.include?.favorites?.where.userId;
    return {
      ...LISTING,
      id: a.where.id,
      author: null,
      // What the real query does: only the viewer's own favourite row is loaded.
      favorites: h.favorites.filter((f) => f.listingId === a.where.id && f.userId === only),
    };
  }),
}));

const LISTING = {
  source: 'COMMUNITY',
  status: 'ACTIVE',
  listingType: 'RENT',
  propertyType: 'APARTMENT',
  title: 'Sunny flat',
  description: 'A sunny flat near the park.',
  priceCents: 150_000,
  beds: 2,
  baths: 1,
  sqft: 700,
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
  createdAt: new Date('2026-11-01T00:00:00Z'),
  updatedAt: new Date('2026-11-01T00:00:00Z'),
  externalUrl: null,
  sourceName: null,
  authorId: 'owner-1',
  priceDroppedAt: null,
};

vi.mock('@/lib/prisma.server', () => ({
  prisma: {
    homeListing: { findUnique: h.findUnique, update: vi.fn(async () => ({})) },
    homeListingPriceChange: { findMany: vi.fn(async () => []) },
    homeFavorite: { updateMany: h.updateMany, deleteMany: h.deleteMany, findMany: h.findMany },
  },
}));
vi.mock('@/lib/homes/geo.server', () => ({ resolveCenter: vi.fn() }));
vi.mock('@/lib/homes/watches.server', () => ({ notifyWatchersOfNewListing: vi.fn() }));
vi.mock('@/lib/notifications.server', () => ({ createNotification: vi.fn() }));

const { setFavoriteNote, getListing, unfavorite, compareFavorites } = await import('@/lib/homes/listings.server');
const { favoriteNoteBody, compareQuery } = await import('@/lib/homes/compare-schema');
const { exportSavedHomes } = await import('@/lib/homes/saved-export.server');
const { refusalBody, ERROR_CODES } = await import('@/lib/errors/codes');

function fav(userId: string, listingId: string, note: string | null): FavRow {
  return {
    id: `${userId}-${listingId}`,
    userId,
    listingId,
    createdAt: new Date('2026-11-10T00:00:00Z'),
    priceAlerts: true,
    priceNoticeAt: null,
    note,
  };
}

beforeEach(() => {
  h.favorites = [fav('me', 'l1', 'viewing Thursday')];
  h.updateMany.mockReset();
  h.updateMany.mockImplementation(async () => ({ count: 0 }));
  h.deleteMany.mockClear();
  h.findMany.mockReset();
  h.findMany.mockImplementation(async () => []);
});

describe('writing a note', () => {
  it('writes only on the caller own favourite row, so an unsaved listing answers false (404)', async () => {
    expect(await setFavoriteNote('me', 'unsaved', 'hello')).toBe(false);
    expect(h.updateMany).toHaveBeenCalledWith({
      where: { userId: 'me', listingId: 'unsaved' },
      data: { note: 'hello' },
    });
  });

  it('is true when the favourite exists, and an empty note clears it', async () => {
    h.updateMany.mockImplementation(async () => ({ count: 1 }));
    expect(await setFavoriteNote('me', 'l1', '   ')).toBe(true);
    expect(h.updateMany).toHaveBeenCalledWith({ where: { userId: 'me', listingId: 'l1' }, data: { note: null } });
  });

  it('answers a missing favourite with the NOT_FOUND refusal in the route', async () => {
    const src = (await import('node:fs')).readFileSync(
      new URL('../api/homes.listings.$id.favorite.note.server.ts', import.meta.url),
      'utf8',
    );
    expect(src).toMatch(/if \(!ok\) return Response\.json\(refusalBody\('NOT_FOUND'\), \{ status: 404 \}\)/);
    expect(src).toContain("rateLimit: 'write'");
    expect(refusalBody('NOT_FOUND')).toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('who can see a note', () => {
  it('shows the note to the member who wrote it', async () => {
    const l = await getListing('l1', 'me', false);
    expect(l?.favorited).toBe(true);
    expect(l?.note).toBe('viewing Thursday');
  });

  it("carries no note in another member's read of the listing", async () => {
    const l = await getListing('l1', 'someone-else', false);
    expect(l).not.toBeNull();
    expect(l?.favorited).toBe(false);
    expect(l && 'note' in l).toBe(false);
    expect(JSON.stringify(l)).not.toContain('viewing Thursday');
  });

  it('carries no note for a signed-out reader or for the listing author', async () => {
    for (const viewer of [null, 'owner-1']) {
      const l = await getListing('l1', viewer, false);
      expect(JSON.stringify(l)).not.toContain('viewing Thursday');
    }
  });

  it('never loads other favourites: the query is filtered to the viewer', async () => {
    await getListing('l1', 'someone-else', false);
    const arg = h.findUnique.mock.calls.at(-1)?.[0];
    expect(arg?.include?.favorites).toEqual({ where: { userId: 'someone-else' } });
  });
});

describe('unsaving', () => {
  it('deletes the favourite row, which is where the note lives', async () => {
    await unfavorite('me', 'l1');
    expect(h.deleteMany).toHaveBeenCalledWith({ where: { userId: 'me', listingId: 'l1' } });
  });
});

describe('the length rule', () => {
  it('allows up to 1000 characters and refuses more', () => {
    expect(favoriteNoteBody.safeParse({ note: 'a'.repeat(1000) }).success).toBe(true);
    expect(favoriteNoteBody.safeParse({ note: 'a'.repeat(1001) }).success).toBe(false);
    expect(favoriteNoteBody.safeParse({ note: '' }).success).toBe(true);
    expect(favoriteNoteBody.safeParse({}).success).toBe(false);
  });

  it('counts a character once however many UTF-16 units it takes', () => {
    expect(favoriteNoteBody.safeParse({ note: '🏠'.repeat(1000) }).success).toBe(true);
    expect(favoriteNoteBody.safeParse({ note: '🏠'.repeat(1001) }).success).toBe(false);
  });
});

describe('comparing', () => {
  it('loads only the caller own saved listings, newest ids first as asked, and counts the rest as missing', async () => {
    h.findMany.mockImplementation(async () => [
      {
        listingId: 'b',
        note: 'no dishwasher',
        listing: { ...LISTING, id: 'b', author: null, favorites: [fav('me', 'b', 'no dishwasher')] },
      },
      { listingId: 'a', note: null, listing: { ...LISTING, id: 'a', author: null, favorites: [fav('me', 'a', null)] } },
    ]);
    const r = await compareFavorites('me', ['a', 'b', 'stranger', 'a']);
    expect(h.findMany.mock.calls[0]?.[0]).toMatchObject({
      where: { userId: 'me', listingId: { in: ['a', 'b', 'stranger'] } },
      take: 4,
    });
    expect(r.listings.map((l) => l.id)).toEqual(['a', 'b']);
    expect(r.notes).toEqual({ a: null, b: 'no dishwasher' });
    expect(r.missing).toBe(1);
  });

  it('asks the database nothing for no ids, and never for more than four', async () => {
    expect((await compareFavorites('me', [])).listings).toEqual([]);
    expect(h.findMany).not.toHaveBeenCalled();
    await compareFavorites('me', ['a', 'b', 'c', 'd', 'e', 'f']);
    expect(h.findMany.mock.calls[0]?.[0]).toMatchObject({ where: { listingId: { in: ['a', 'b', 'c', 'd'] } } });
  });

  it('validates the ids as one comma-separated parameter', () => {
    expect(compareQuery.safeParse({ ids: 'a,b,c' }).success).toBe(true);
    expect(compareQuery.safeParse({ ids: 'a,b;DROP' }).success).toBe(false);
    expect(compareQuery.safeParse({}).success).toBe(false);
  });

  it('refuses a fifth with the registered code', () => {
    expect(ERROR_CODES.HOME_COMPARE_TOO_MANY.http).toBe(400);
    expect(refusalBody('HOME_COMPARE_TOO_MANY', { max: 4 })).toMatchObject({
      code: 'HOME_COMPARE_TOO_MANY',
      error: 'Compare at most 4 homes at a time',
    });
  });
});

describe('the data export', () => {
  it('lists only the member own saved homes with the note and alert setting', async () => {
    h.findMany.mockImplementation(async () => [
      {
        listingId: 'l1',
        createdAt: new Date('2026-11-10T00:00:00Z'),
        note: 'viewing Thursday',
        priceAlerts: false,
        listing: {
          title: 'Sunny flat',
          city: 'Rochester',
          state: 'NY',
          priceCents: 150_000,
          listingType: 'RENT',
          status: 'ACTIVE',
        },
      },
    ]);
    const rows = await exportSavedHomes('me');
    expect(h.findMany.mock.calls[0]?.[0]).toMatchObject({ where: { userId: 'me' } });
    expect(rows).toEqual([
      {
        listingId: 'l1',
        savedAt: '2026-11-10T00:00:00.000Z',
        note: 'viewing Thursday',
        priceAlerts: false,
        title: 'Sunny flat',
        city: 'Rochester',
        state: 'NY',
        price: 1500,
        listingType: 'RENT',
        status: 'ACTIVE',
      },
    ]);
  });
});
