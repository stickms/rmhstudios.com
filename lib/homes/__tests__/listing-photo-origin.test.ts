import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handlersOfModule } from '@/lib/__tests__/api-handlers-of';

/**
 * s11-18: a community listing names its author's own site photos only. Both write routes refuse a photo on another
 * host or another member's upload with `LISTING_PHOTO_NOT_SITE` and a `count`; the update is checked against the
 * listing's author; a scraped listing (no author) is untouched; the pure check is the one the form runs.
 */

const h = vi.hoisted(() => ({
  created: [] as Array<{ userId: string; images: string[] }>,
  updated: [] as Array<{ id: string; userId: string; images: string[] }>,
  authors: {} as Record<string, string | null>,
}));

vi.mock('@/lib/api/handler.server', () => ({ defineHandler: (_o: unknown, fn: unknown) => fn }));
vi.mock('@/lib/api/implement.server', () => ({ implement: (_c: unknown, _o: unknown, fn: unknown) => fn }));
vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: vi.fn(async () => null) } } }));
vi.mock('@/lib/rate-limit', () => ({ rateLimit: () => ({ allowed: true }), getClientIp: () => 'ip' }));
vi.mock('@/lib/homes/geo.server', () => ({ resolveCenter: vi.fn(async () => ({ lat: 43.1, lng: -77.6 })) }));
vi.mock('@/lib/homes/listings.server', () => ({
  browseListings: vi.fn(),
  listMine: vi.fn(),
  listFavorites: vi.fn(),
  getListing: vi.fn(),
  deleteListing: vi.fn(),
  setListingStatus: vi.fn(),
  createListing: vi.fn(async (userId: string, input: { images: string[] }) => {
    h.created.push({ userId, images: input.images });
    return { id: 'new1' };
  }),
  listingAuthorId: vi.fn(async (id: string) => h.authors[id] ?? null),
  updateListing: vi.fn(async (id: string, userId: string, input: { images: string[] }) => {
    h.updated.push({ id, userId, images: input.images });
    return true;
  }),
}));

import { foreignListingPhotos, foreignListingPhotoIndexes } from '../photo-origin';

type Handler = (a: unknown) => Promise<Response>;

const own = (name: string, user = 'u1') => `/api/feed/image/${user}-${name}.webp`;
const OWN_UPLOAD = own('1700000000-ab12');
const OWN_GENERATED = own('1700000001-cd34');
const OTHER_MEMBER = own('1700000002-ef56', 'u2');
const THIRD_PARTY = 'https://elsewhere.example/house.jpg';

const base = {
  listingType: 'RENT',
  propertyType: 'APARTMENT',
  title: 'Sunny two-bed near the park',
  description: 'A bright flat with a view of the park.',
  price: 1500,
  beds: 2,
  baths: 1,
  city: 'Rochester',
  state: 'NY',
  lat: 43.1,
  lng: -77.6,
};

const session = (id: string) => ({ user: { id } });

async function post(userId: string, body: Record<string, unknown>) {
  const mod = await import('@/app/routes/api/homes/listings');
  const handler = handlersOfModule<Handler>(mod).POST!;
  return handler({
    request: new Request('http://x/api/homes/listings', { method: 'POST', body: JSON.stringify(body) }),
    params: {},
    userId,
    session: session(userId),
  });
}

async function patch(userId: string, id: string, body: Record<string, unknown>) {
  const mod = await import('@/lib/homes/api/homes.listings.$id.server');
  const handler = handlersOfModule<Handler>(mod).PATCH!;
  return handler({
    request: new Request(`http://x/api/homes/listings/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    params: { id },
    userId,
    session: session(userId),
  });
}

beforeEach(() => {
  h.created.length = 0;
  h.updated.length = 0;
  h.authors = { l1: 'u1', scraped: null };
});

describe('foreignListingPhotos (the check the form runs too)', () => {
  it('passes the author’s upload and generated photo, fails another host and another member', () => {
    expect(foreignListingPhotos([OWN_UPLOAD, OWN_GENERATED], 'u1')).toEqual([]);
    expect(foreignListingPhotos([THIRD_PARTY, OWN_UPLOAD, OTHER_MEMBER], 'u1')).toEqual([THIRD_PARTY, OTHER_MEMBER]);
    expect(foreignListingPhotoIndexes([THIRD_PARTY, OWN_UPLOAD, OTHER_MEMBER], 'u1')).toEqual([0, 2]);
  });

  it('does not accept a look-alike prefix or a path that climbs out of the feed space', () => {
    expect(foreignListingPhotos(['/api/feed/image/u10-1-2.webp', '/api/feed/image/../u1-1-2.webp'], 'u1')).toHaveLength(
      2,
    );
  });
});

describe('create', () => {
  it('refuses a third-party address and another member’s upload, with the code and how many', async () => {
    const res = await post('u1', { ...base, images: [OWN_UPLOAD, THIRD_PARTY, OTHER_MEMBER], aiImages: [] });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      code: 'LISTING_PHOTO_NOT_SITE',
      count: 2,
      error: 'Use photos uploaded to this listing',
    });
    expect(h.created).toHaveLength(0);
  });

  it('accepts the author’s upload and generated photo', async () => {
    const res = await post('u1', { ...base, images: [OWN_UPLOAD, OWN_GENERATED], aiImages: [OWN_GENERATED] });
    expect(res.status).toBe(200);
    expect(h.created).toEqual([{ userId: 'u1', images: [OWN_UPLOAD, OWN_GENERATED] }]);
  });
});

describe('update', () => {
  it('refuses the same photos with the same code', async () => {
    const res = await patch('u1', 'l1', { ...base, images: [THIRD_PARTY], aiImages: [] });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: 'LISTING_PHOTO_NOT_SITE', count: 1 });
    const other = await patch('u1', 'l1', { ...base, images: [OWN_UPLOAD, OTHER_MEMBER], aiImages: [] });
    expect(await other.json()).toMatchObject({ code: 'LISTING_PHOTO_NOT_SITE', count: 1 });
    expect(h.updated).toHaveLength(0);
  });

  it('accepts the author’s own photos', async () => {
    const res = await patch('u1', 'l1', { ...base, images: [OWN_UPLOAD, OWN_GENERATED], aiImages: [OWN_GENERATED] });
    expect(res.status).toBe(200);
    expect(h.updated).toEqual([{ id: 'l1', userId: 'u1', images: [OWN_UPLOAD, OWN_GENERATED] }]);
  });

  it('checks against the listing’s author, not the caller: another member cannot edit it, whatever their photos', async () => {
    const res = await patch('u2', 'l1', { ...base, images: [OTHER_MEMBER], aiImages: [] });
    expect(res.status).toBe(404);
    expect(h.updated).toHaveLength(0);
  });

  it('leaves a scraped listing (no author) untouched', async () => {
    const res = await patch('u1', 'scraped', { ...base, images: [OWN_UPLOAD], aiImages: [] });
    expect(res.status).toBe(404);
    expect(h.updated).toHaveLength(0);
  });
});
