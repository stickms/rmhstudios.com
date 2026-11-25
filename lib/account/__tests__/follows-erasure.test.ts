import { describe, expect, it, vi } from 'vitest';

/**
 * Sprint 10 19: subscriptions, activity, RSVPs, handle history, listings and the small per-member records are erased
 * with the account, each by the member's own id; counters on kept feeds and series are corrected from reads made
 * before the transaction; `Follow` and `RmhTubeSubscription` (owner decisions) are untouched.
 */

interface Op {
  model: string;
  method: string;
  args: { where?: Record<string, unknown>; data?: Record<string, unknown> };
}

const h = vi.hoisted(() => {
  const model = (name: string) =>
    new Proxy({}, { get: (_t, method: string) => (args: unknown) => ({ model: name, method, args }) });
  const media = {
    findMany: vi.fn(async (): Promise<unknown> => ({})),
    deleteMany: vi.fn(async (_a: unknown) => ({})),
    updateMany: (args: unknown) => ({ model: 'media', method: 'updateMany', args }),
  };
  const raw: { sql: string; values: unknown[] }[] = [];
  const executeRaw = (strings: TemplateStringsArray, ...values: unknown[]) => {
    const op = { model: '$executeRaw', method: 'raw', args: undefined, sql: strings.join('?'), values };
    raw.push(op);
    return op;
  };
  const prismaMock = new Proxy(
    { $transaction: vi.fn(async (ops: unknown[]) => ops), $executeRaw: executeRaw } as Record<string, unknown>,
    { get: (t, key: string) => (key in t ? t[key] : key === 'media' ? media : model(key)) },
  );
  const deleteObject = vi.fn(async (_k: string) => undefined);
  return { prismaMock, deleteObject, media };
});

vi.mock('@/lib/prisma.server', () => ({ prisma: h.prismaMock }));
vi.mock('@/lib/storage/s3.server', () => ({ deleteObject: h.deleteObject }));
vi.mock('@/lib/storage/cdn.server', () => ({ purgeFromCdn: vi.fn(async () => undefined) }));
vi.mock('@/lib/email/send.server', () => ({ sendEmail: vi.fn(async () => undefined) }));

import { anonymizeAccount } from '@/lib/account/deletion.server';
import {
  counterOps,
  deleteMemberListingImageObjects,
  followsErasureOps,
  readListingImageUrls,
} from '@/lib/account/erasure-follows.server';
import { ERASURE_REGISTRY, TODO_CEILING } from '@/lib/account/erasure-registry';
import { variantKeysFor } from '@/lib/media/ingest.server';
import { referencedUrls, type SweepDeps } from '@/lib/media/sweep.server';

const U = 'user-1';
const NOW = new Date('2026-12-01T00:00:00Z');

const find = (ops: Op[], model: string, method: string, pick?: (o: Op) => boolean) =>
  ops.find((o) => o.model === model && o.method === method && (!pick || pick(o)));

describe('followsErasureOps', () => {
  const ops = followsErasureOps(U, NOW) as unknown as Op[];

  it('deletes each table by the member column', () => {
    const byUserId = [
      'customFeedSubscription',
      'postSeriesFollow',
      'watch',
      'activity',
      'rsvp',
      'homeRoommateProfile',
      'rideshareDriver',
      'libraryQuotaRequest',
      'userQuest',
    ];
    for (const m of byUserId) expect(find(ops, m, 'deleteMany')!.args.where, m).toEqual({ userId: U });
    expect(find(ops, 'homeListing', 'deleteMany')!.args.where).toEqual({ authorId: U });
  });

  it('decrements the counters inside the transaction from the rows that exist, parameterized and floored', () => {
    const raws = ops.filter((o) => o.model === '$executeRaw') as unknown as { sql: string; values: unknown[] }[];
    expect(raws).toHaveLength(2);
    expect(raws[0]!.sql).toBe(
      'UPDATE "custom_feed" SET "subscriberCount" = "subscriberCount" - 1 WHERE "id" IN (SELECT "feedId" FROM "custom_feed_subscription" WHERE "userId" = ?) AND "subscriberCount" > 0',
    );
    expect(raws[1]!.sql).toBe(
      'UPDATE "post_series" SET "followCount" = "followCount" - 1 WHERE "id" IN (SELECT "seriesId" FROM "post_series_follow" WHERE "userId" = ?) AND "followCount" > 0',
    );
    for (const r of raws) expect(r.values).toEqual([U]);
    // The counters are corrected before the subscription rows go, so a retry (no rows left) decrements nothing.
    const second = ops.indexOf(raws[1] as unknown as Op);
    expect(second).toBeLessThan(ops.findIndex((o) => o.model === 'customFeedSubscription'));
    expect(second).toBeLessThan(ops.findIndex((o) => o.model === 'postSeriesFollow'));
  });

  it('skips the raw counters against a client without $executeRaw (test proxies)', () => {
    const saved = h.prismaMock.$executeRaw;
    expect(counterOps(U)).toHaveLength(2);
    expect(saved).toBeTypeOf('function');
  });

  it('erases handle history only past the reclaim window', () => {
    const op = find(ops, 'handleChange', 'deleteMany')!;
    expect(op.args.where).toEqual({ userId: U, createdAt: { lt: new Date('2026-11-01T00:00:00Z') } });
  });

  it('de-identifies official collections and erases the member’s own', () => {
    const upd = find(ops, 'libraryCollection', 'updateMany')!;
    expect(upd.args).toEqual({ where: { ownerUserId: U, official: true }, data: { ownerUserId: null } });
    expect(find(ops, 'libraryCollection', 'deleteMany')!.args.where).toEqual({ ownerUserId: U, official: false });
  });

  it('nulls decisions the member made as an admin', () => {
    expect(find(ops, 'libraryQuotaRequest', 'updateMany')!.args).toEqual({
      where: { decidedByUserId: U },
      data: { decidedByUserId: null },
    });
    expect(find(ops, 'rideshareDriver', 'updateMany')!.args).toEqual({
      where: { reviewedById: U },
      data: { reviewedById: null },
    });
  });

  it('does not touch Follow or RmhTubeSubscription', () => {
    expect(ops.some((o) => o.model === 'follow' || o.model === 'rmhTubeSubscription')).toBe(false);
  });
});

describe('listing photo objects', () => {
  it('reads no urls when the read is not rows (test proxies)', async () => {
    expect(await readListingImageUrls(U)).toEqual([]);
  });

  const url = (name: string) => `/api/feed/image/${name}`;
  const none = { referenced: vi.fn(async () => new Set<string>()) };

  it('does nothing without the member’s own urls, and fails safe when the reference check cannot run', async () => {
    h.deleteObject.mockClear();
    await deleteMemberListingImageObjects(U, [], none);
    await deleteMemberListingImageObjects(U, ['https://elsewhere.example/a.jpg', url('someone-else-1-2.webp')], none);
    expect(none.referenced).not.toHaveBeenCalled();
    const broken = { referenced: vi.fn(async () => Promise.reject(new Error('db down'))) };
    await expect(deleteMemberListingImageObjects(U, [url(`${U}-1-1.webp`)], broken)).resolves.toBeUndefined();
    expect(h.deleteObject).not.toHaveBeenCalled();
  });

  it('deletes the member’s own photo objects by url (no Media row exists), keeping one still referenced or that will not delete', async () => {
    h.deleteObject.mockReset();
    h.media.deleteMany.mockClear();
    const a = url(`${U}-1-1.webp`);
    const b = url(`${U}-2-2.webp`);
    const shared = url(`${U}-3-3.webp`);
    h.deleteObject.mockImplementation(async (k: string) => {
      if (k === `rmharks/${U}-2-2.webp`) throw new Error('down');
    });
    const deps = { referenced: vi.fn(async () => new Set([shared])) };
    await deleteMemberListingImageObjects(U, [a, b, shared, a], deps);
    expect(deps.referenced).toHaveBeenCalledWith([a, b, shared]);
    expect(h.deleteObject).toHaveBeenCalledWith(`rmharks/${U}-1-1.webp`);
    expect(h.deleteObject).not.toHaveBeenCalledWith(`rmharks/${U}-3-3.webp`);
    expect(h.media.deleteMany).toHaveBeenCalledWith({ where: { userId: U, url: { in: [a] } } });
    h.deleteObject.mockReset();
  });

  it('deletes an owned photo and every variant with no Media row, and never another member’s or a third-party URL', async () => {
    h.deleteObject.mockReset();
    const a = url(`${U}-5-5.webp`);
    const b = url(`${U}-6-6.webp`);
    await deleteMemberListingImageObjects(
      U,
      [a, b, url('someone-else-1-2.webp'), 'https://elsewhere.example/a.jpg'],
      none,
    );
    const deleted = h.deleteObject.mock.calls.map((c) => c[0]);
    for (const key of [`rmharks/${U}-5-5.webp`, `rmharks/${U}-6-6.webp`]) {
      expect(deleted).toContain(key);
      for (const variant of variantKeysFor(key)) expect(deleted).toContain(variant);
    }
    expect(deleted.some((k) => k.includes('someone-else') || k.includes('elsewhere'))).toBe(false);
  });

  it('keeps a url a post still names, through the sweep’s own reference check', async () => {
    h.deleteObject.mockReset();
    const kept = url(`${U}-7-7.webp`);
    const free = url(`${U}-8-8.webp`);
    const empty = vi.fn(async () => []);
    const fake = {
      prisma: new Proxy(
        {},
        {
          get: (_t, model: string) => ({
            findMany: model === 'rMHark' ? vi.fn(async () => [{ imageUrls: [kept] }]) : empty,
          }),
        },
      ),
    } as unknown as SweepDeps;
    await deleteMemberListingImageObjects(U, [kept, free], { referenced: (urls) => referencedUrls(fake, urls) });
    const deleted = h.deleteObject.mock.calls.map((c) => c[0]);
    expect(deleted).toContain(`rmharks/${U}-8-8.webp`);
    expect(deleted).not.toContain(`rmharks/${U}-7-7.webp`);
  });
});

describe('anonymizeAccount (follows)', () => {
  it('runs the operations inside the transaction and leaves the owner tables alone', async () => {
    const fn = h.prismaMock.$transaction as ReturnType<typeof vi.fn>;
    fn.mockClear();
    await anonymizeAccount(U);
    const all = fn.mock.calls[0]![0] as Op[];
    // The two follow-counter statements; other features' raw erasure statements (e.g. Synapse Storm's) share the transaction.
    const counters = all.filter(
      (o) => o.model === '$executeRaw' && /"(subscriberCount|followCount)"/.test((o as unknown as { sql: string }).sql),
    );
    expect(counters).toHaveLength(2);
    expect(find(all, 'watch', 'deleteMany')!.args.where).toEqual({ userId: U });
    expect(find(all, 'rsvp', 'deleteMany')!.args.where).toEqual({ userId: U });
    expect(find(all, 'userQuest', 'deleteMany')!.args.where).toEqual({ userId: U });
    expect(all.some((o) => o.model === 'follow' || o.model === 'rmhTubeSubscription')).toBe(false);
  });
});

describe('registry', () => {
  it('erases the twelve tables, classifies RmhTubeSubscription as owner and leaves four todo', () => {
    for (const m of [
      'Activity',
      'CustomFeedSubscription',
      'HandleChange',
      'HomeListing',
      'HomeRoommateProfile',
      'LibraryCollection',
      'LibraryQuotaRequest',
      'PostSeriesFollow',
      'RideshareDriver',
      'Rsvp',
      'UserQuest',
      'Watch',
    ])
      expect(ERASURE_REGISTRY[m]?.decision, m).toBe('erase');
    expect(ERASURE_REGISTRY.RmhTubeSubscription?.decision).toBe('owner');
    expect(ERASURE_REGISTRY.Follow?.decision).toBe('owner');
    const todo = Object.entries(ERASURE_REGISTRY)
      .filter(([, e]) => e.decision === 'todo')
      .map(([k]) => k)
      .sort();
    expect(todo).toEqual(['RebarReservation', 'Streak', 'UserInventory', 'UserSeasonProgress']);
    expect(TODO_CEILING).toBe(4);
  });
});
