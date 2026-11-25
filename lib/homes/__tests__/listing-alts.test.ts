import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Photo descriptions on a home listing: whatever length the caller sends, the stored `imageAlts` matches `images`
// (on create and on update), the DTO always carries a matching list, and a description over the limit is refused
// with its code by both write routes.

const h = vi.hoisted(() => ({
  created: [] as Array<Record<string, unknown>>,
  updated: [] as Array<Record<string, unknown>>,
  row: null as Record<string, unknown> | null,
}));

vi.mock('@/lib/prisma.server', () => {
  const tx = {
    $executeRaw: vi.fn(async () => 0),
    homeListing: {
      findFirst: vi.fn(async () => ({ priceCents: 150_000, images: ['a', 'b', 'a'], imageAlts: ['A1', 'B', 'A2'] })),
      updateMany: vi.fn(async (a: { data: Record<string, unknown> }) => {
        h.updated.push(a.data);
        return { count: 1 };
      }),
    },
    homeListingPriceChange: { create: vi.fn(async () => ({})) },
  };
  return {
    prisma: {
      $transaction: async (fn: (t: typeof tx) => unknown) => fn(tx),
      homeListing: {
        create: vi.fn(async (a: { data: Record<string, unknown> }) => {
          h.created.push(a.data);
          return { id: 'l1' };
        }),
        findUnique: vi.fn(async () => h.row),
        update: vi.fn(async () => ({})),
      },
      homeListingPriceChange: { findMany: vi.fn(async () => []) },
      homeFavorite: { findMany: vi.fn(async () => []) },
      userBlock: { findMany: vi.fn(async () => []) },
    },
  };
});
vi.mock('@/lib/notifications.server', () => ({ createNotification: vi.fn(async () => {}) }));
vi.mock('@/lib/homes/geo.server', () => ({ resolveCenter: vi.fn() }));
vi.mock('@/lib/homes/watches.server', () => ({ notifyWatchersOfNewListing: vi.fn() }));

import { createListing, getListing, updateListing } from '../listings.server';
import { LISTING_PHOTO_ALT_MAX, imageAltsRefusal } from '../photos';
import type { ListingInput } from '../types';

function input(over: Partial<ListingInput>): ListingInput {
  return {
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
    amenities: [],
    petsAllowed: false,
    images: ['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg'],
    aiImages: [],
    ...over,
  };
}

beforeEach(() => {
  h.created.length = 0;
  h.updated.length = 0;
  h.row = null;
});

describe('a write stores descriptions matching the photos', () => {
  it('pads a short list on create', async () => {
    await createListing('u1', input({ imageAlts: ['Kitchen', 'Bedroom'] }));
    expect(h.created[0]?.imageAlts).toEqual(['Kitchen', 'Bedroom', '', '']);
  });

  it('stores empty descriptions when the caller sent none', async () => {
    await createListing('u1', input({}));
    expect(h.created[0]?.imageAlts).toEqual(['', '', '', '']);
  });

  it('truncates a long list, trims and strips control characters on update', async () => {
    const ok = await updateListing(
      'l1',
      'u1',
      input({ images: ['a.jpg', 'b.jpg'], imageAlts: ['  Kitchen\u0007  ', 'Bedroom', 'Extra', 'More'] }),
    );
    expect(ok).toBe(true);
    expect(h.updated[0]?.images).toEqual(['a.jpg', 'b.jpg']);
    expect(h.updated[0]?.imageAlts).toEqual(['Kitchen', 'Bedroom']);
  });

  it("keeps each photo's own description when an update sends photos without descriptions", async () => {
    // Stored: a (A1), b (B), a (A2). The edit drops b and puts a new photo first.
    await updateListing('l1', 'u1', input({ images: ['new', 'a', 'a'], aiImages: [], imageAlts: undefined }));
    expect(h.updated[0]?.imageAlts).toEqual(['', 'A1', 'A2']);
  });

  it('matches the photos even past the twelve-photo cap', async () => {
    const many = Array.from({ length: 15 }, (_, i) => `p${i}.jpg`);
    await createListing('u1', input({ images: many, imageAlts: many.map((_, i) => `Photo ${i}`) }));
    expect(h.created[0]?.images).toHaveLength(12);
    expect(h.created[0]?.imageAlts).toHaveLength(12);
  });
});

describe('the listing read', () => {
  it('carries descriptions matching the photos, for an old row with none', async () => {
    h.row = {
      id: 'l1',
      source: 'COMMUNITY',
      status: 'ACTIVE',
      listingType: 'RENT',
      propertyType: 'APARTMENT',
      title: 'T',
      description: 'D',
      priceCents: 100_000,
      beds: 1,
      baths: 1,
      sqft: null,
      address: null,
      city: 'C',
      state: 'S',
      postalCode: null,
      lat: 0,
      lng: 0,
      amenities: [],
      petsAllowed: false,
      availableFrom: null,
      images: ['a.jpg', 'b.jpg'],
      aiImages: [],
      imageAlts: [],
      viewsCount: 0,
      createdAt: new Date(0),
      updatedAt: new Date(0),
      author: null,
      authorId: 'u9',
      externalUrl: null,
      sourceName: null,
      favorites: [],
      priceDroppedAt: null,
    };
    const listing = await getListing('l1', null, false);
    expect(listing?.imageAlts).toEqual(['', '']);
  });
});

describe('an over-long description is refused with a code', () => {
  it('names the code and the limit', () => {
    const body = imageAltsRefusal(['fine', 'x'.repeat(LISTING_PHOTO_ALT_MAX + 1)]);
    expect(body).toMatchObject({
      code: 'LISTING_PHOTO_ALT_TOO_LONG',
      max: LISTING_PHOTO_ALT_MAX,
      error: `A photo description can have at most ${LISTING_PHOTO_ALT_MAX} characters`,
    });
  });

  it('is asked by both write routes before they save', () => {
    const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    for (const file of ['app/routes/api/homes/listings.ts', 'lib/homes/api/homes.listings.$id.server.ts']) {
      const src = strip(readFileSync(join(process.cwd(), file), 'utf8'));
      expect(src, file).toContain('imageAlts: z.array(');
      expect(src, file).toMatch(/imageAltsRefusal\(parsed\.data\.imageAlts\)/);
      expect(src, file).toMatch(/Response\.json\(altsRefusal, \{ status: 400 \}\)/);
    }
  });
});
