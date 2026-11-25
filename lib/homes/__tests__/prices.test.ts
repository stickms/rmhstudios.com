import { beforeEach, describe, expect, it, vi } from 'vitest';

// Price changes on home listings: the author's edit records one change inside its transaction (an unchanged price
// records none), a drop tells the favouriters once a week and never the author, blocked or banned members, and the
// history and alert endpoints refuse what the public listing read would not show.

const h = vi.hoisted(() => ({
  listing: { priceCents: 150_000 } as { priceCents: number } | null,
  created: [] as Array<Record<string, unknown>>,
  updated: [] as Array<Record<string, unknown>>,
  txUpdateMany: vi.fn(async () => ({ count: 1 })),
  executeRaw: vi.fn(async () => 0),
  notify: vi.fn(async () => {}),
  historyRows: [] as Array<Record<string, unknown>>,
  listingRow: null as { status: string; authorId: string | null } | null,
  favUpdateMany: vi.fn(async () => ({ count: 1 })),
}));

vi.mock('@/lib/prisma.server', () => {
  const tx = {
    $executeRaw: h.executeRaw,
    homeListing: {
      findFirst: vi.fn(async () => h.listing),
      updateMany: h.txUpdateMany,
      update: vi.fn(async (a: Record<string, unknown>) => {
        h.updated.push(a);
        return {};
      }),
    },
    homeListingPriceChange: {
      create: vi.fn(async (a: { data: Record<string, unknown> }) => {
        h.created.push(a.data);
        return {};
      }),
    },
  };
  return {
    prisma: {
      $transaction: async (fn: (t: typeof tx) => unknown) => fn(tx),
      homeListing: { findUnique: vi.fn(async () => h.listingRow) },
      homeListingPriceChange: { findMany: vi.fn(async () => h.historyRows) },
      homeFavorite: { updateMany: h.favUpdateMany, findMany: vi.fn(async () => []) },
      userBlock: { findMany: vi.fn(async () => []) },
    },
  };
});
vi.mock('@/lib/notifications.server', () => ({ createNotification: h.notify }));
vi.mock('@/lib/homes/geo.server', () => ({ resolveCenter: vi.fn() }));
vi.mock('@/lib/homes/watches.server', () => ({ notifyWatchersOfNewListing: vi.fn() }));

const { updateListing } = await import('@/lib/homes/listings.server');
const { listPriceHistory, setPriceAlerts } = await import('@/lib/homes/prices.server');
const { notifyPriceDrop, dropNotice } = await import('@/lib/homes/price-drop-notify.server');

const INPUT = {
  listingType: 'RENT' as const,
  propertyType: 'APARTMENT' as const,
  title: 'Sunny flat',
  description: 'A sunny flat near the park.',
  price: 1400,
  beds: 2,
  baths: 1,
  city: 'Rochester',
  state: 'NY',
  lat: 43.1,
  lng: -77.6,
  amenities: [],
  petsAllowed: false,
  images: [],
  aiImages: [],
};

beforeEach(() => {
  h.listing = { priceCents: 150_000 };
  h.created.length = 0;
  h.updated.length = 0;
  h.notify.mockClear();
  h.executeRaw.mockClear();
  h.txUpdateMany.mockClear();
  h.favUpdateMany.mockClear();
});

describe('updateListing records price changes', () => {
  it('records one change and stamps priceDroppedAt when the author lowers the rent', async () => {
    expect(await updateListing('l1', 'author1', INPUT)).toBe(true);
    expect(h.created).toHaveLength(1);
    expect(h.created[0]).toMatchObject({ listingId: 'l1', oldCents: 150_000, newCents: 140_000, source: 'author' });
    expect(h.updated).toHaveLength(1);
    expect(h.updated[0]).toMatchObject({ where: { id: 'l1' }, data: { priceDroppedAt: expect.any(Date) } });
    // The read, the edit and the record share one transaction under a per-listing lock.
    expect(h.executeRaw).toHaveBeenCalledTimes(1);
  });

  it('records nothing when the price is unchanged', async () => {
    h.listing = { priceCents: 140_000 };
    expect(await updateListing('l1', 'author1', INPUT)).toBe(true);
    expect(h.created).toEqual([]);
    expect(h.updated).toEqual([]);
  });

  it('records a rise without stamping a drop', async () => {
    h.listing = { priceCents: 120_000 };
    await updateListing('l1', 'author1', INPUT);
    expect(h.created).toHaveLength(1);
    expect(h.updated).toEqual([]);
  });

  it('answers false, and writes nothing, for a listing the caller does not own', async () => {
    h.listing = null;
    expect(await updateListing('l1', 'someone-else', INPUT)).toBe(false);
    expect(h.txUpdateMany).not.toHaveBeenCalled();
    expect(h.created).toEqual([]);
  });
});

// ── The drop fan-out, against a small in-memory database ────────────────────

interface Fav {
  id: string;
  userId: string;
  listingId: string;
  priceAlerts: boolean;
  priceNoticeAt: Date | null;
  createdAt: number;
}
type Where = Record<string, unknown>;
type Users = Map<string, { bannedUntil: Date | null }>;

function matches(row: Record<string, unknown>, where: Where, users: Users): boolean {
  return Object.entries(where).every(([k, v]) => {
    if (k === 'OR') return (v as Where[]).some((w) => matches(row, w, users));
    if (k === 'user') {
      return matches((users.get(row.userId as string) ?? {}) as Record<string, unknown>, v as Where, users);
    }
    const cur = row[k];
    if (v === null) return cur === null || cur === undefined;
    if (v && typeof v === 'object' && !(v instanceof Date)) {
      const op = v as { not?: unknown; lte?: Date; in?: unknown[] };
      if ('not' in op) return cur !== op.not;
      if (op.lte) return cur instanceof Date && cur <= op.lte;
      if (op.in) return op.in.includes(cur);
      return false;
    }
    return cur === v;
  });
}

function world(favs: Fav[], blocks: Array<{ blockerId: string; blockedId: string }> = [], banned: string[] = []) {
  const users: Users = new Map();
  for (const f of favs) users.set(f.userId, { bannedUntil: banned.includes(f.userId) ? new Date('2027-01-01') : null });
  const delivered: string[] = [];
  const takes: Array<number | undefined> = [];
  const asRow = (x: unknown) => x as Record<string, unknown>;
  const prisma = {
    homeFavorite: {
      async findMany(a: { where: Where; take?: number }) {
        takes.push(a.take);
        return favs
          .filter((f) => matches(asRow(f), a.where, users))
          .slice(0, a.take ?? 1e9)
          .map((f) => ({ id: f.id, userId: f.userId }));
      },
      async updateMany(a: { where: Where; data: { priceNoticeAt: Date } }) {
        const hit = favs.filter((f) => matches(asRow(f), a.where, users));
        for (const f of hit) f.priceNoticeAt = a.data.priceNoticeAt;
        return { count: hit.length };
      },
    },
    userBlock: {
      async findMany(a: { where: { OR: Where[] } }) {
        return blocks.filter((b) => a.where.OR.some((w) => matches(asRow(b), w, users)));
      },
    },
  };
  const deliver = async (userId: string) => {
    delivered.push(userId);
  };
  return { prisma, deliver, delivered, takes };
}

const fav = (userId: string, over: Partial<Fav> = {}): Fav => ({
  id: `f-${userId}`,
  userId,
  listingId: 'l1',
  priceAlerts: true,
  priceNoticeAt: null,
  createdAt: 0,
  ...over,
});
const DROP = {
  listingId: 'l1',
  authorId: 'author1',
  title: 'Sunny flat',
  city: 'Rochester',
  state: 'NY',
  oldCents: 150_000,
  newCents: 140_000,
};
const NOW = new Date('2026-12-01T12:00:00Z');
const DAY = 24 * 60 * 60 * 1000;

describe('notifyPriceDrop', () => {
  it('tells favouriters with the switch on, and no one else', async () => {
    const w = world([fav('a'), fav('b', { priceAlerts: false })]);
    expect(await notifyPriceDrop(w, DROP, NOW)).toBe(1);
    expect(w.delivered).toEqual(['a']);
  });

  it('sends one notice a week per listing and member', async () => {
    const w = world([fav('a')]);
    await notifyPriceDrop(w, DROP, NOW);
    expect(await notifyPriceDrop(w, DROP, new Date(NOW.getTime() + 2 * DAY))).toBe(0);
    expect(w.delivered).toEqual(['a']);
    expect(await notifyPriceDrop(w, DROP, new Date(NOW.getTime() + 7 * DAY))).toBe(1);
    expect(w.delivered).toEqual(['a', 'a']);
  });

  it('never tells the author, nor members blocked by or blocking the author, nor banned accounts', async () => {
    const w = world(
      [fav('author1'), fav('blocked'), fav('blocker'), fav('banned'), fav('ok')],
      [
        { blockerId: 'author1', blockedId: 'blocked' },
        { blockerId: 'blocker', blockedId: 'author1' },
      ],
      ['banned'],
    );
    await notifyPriceDrop(w, DROP, NOW);
    expect(w.delivered).toEqual(['ok']);
  });

  it('lets two drops at once tell a member only once (the claim is conditional)', async () => {
    const w = world([fav('a')]);
    await Promise.all([notifyPriceDrop(w, DROP, NOW), notifyPriceDrop(w, DROP, NOW)]);
    expect(w.delivered).toEqual(['a']);
  });

  it("reads at most 1,000 favouriters and tells a scraped listing's favouriters too (no author)", async () => {
    const w = world([fav('a')]);
    expect(await notifyPriceDrop(w, { ...DROP, authorId: null }, NOW)).toBe(1);
    expect(w.takes).toEqual([1000]);
  });

  it('keeps going when one delivery fails', async () => {
    const w = world([fav('a'), fav('b')]);
    const out: string[] = [];
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const n = await notifyPriceDrop(
      {
        prisma: w.prisma,
        deliver: async (userId: string) => {
          if (userId === 'a') throw new Error('boom');
          out.push(userId);
        },
      },
      DROP,
      NOW,
    );
    err.mockRestore();
    expect(n).toBe(1);
    expect(out).toEqual(['b']);
  });

  it('words the notice as a key with whole-dollar params', () => {
    expect(dropNotice(DROP)).toMatchObject({
      key: 'home-price-drop',
      params: { title: 'Sunny flat', city: 'Rochester', state: 'NY', was: '1,500', now: '1,400' },
    });
  });
});

describe('the history and the alert switch', () => {
  it('answers null (404) for a missing listing and for an inactive one the viewer does not own', async () => {
    h.listingRow = null;
    expect(await listPriceHistory('l1', null)).toBeNull();
    h.listingRow = { status: 'REMOVED', authorId: 'author1' };
    expect(await listPriceHistory('l1', 'stranger')).toBeNull();
    expect(await listPriceHistory('l1', 'author1')).toEqual([]);
  });

  it('returns rows with dollars and percent for an active listing', async () => {
    h.listingRow = { status: 'ACTIVE', authorId: 'author1' };
    h.historyRows = [
      { id: 'c1', oldCents: 150_000, newCents: 140_000, source: 'author', changedAt: new Date('2026-12-01T00:00:00Z') },
    ];
    expect(await listPriceHistory('l1', null)).toEqual([
      {
        id: 'c1',
        oldPrice: 1500,
        newPrice: 1400,
        percent: -6.7,
        source: 'author',
        changedAt: '2026-12-01T00:00:00.000Z',
      },
    ]);
  });

  it("updates only the caller's own favourite row and answers false when there is none", async () => {
    expect(await setPriceAlerts('u1', 'l1', false)).toBe(true);
    expect(h.favUpdateMany).toHaveBeenCalledWith({
      where: { userId: 'u1', listingId: 'l1' },
      data: { priceAlerts: false },
    });
    h.favUpdateMany.mockResolvedValueOnce({ count: 0 });
    expect(await setPriceAlerts('u1', 'l2', true)).toBe(false);
  });
});
