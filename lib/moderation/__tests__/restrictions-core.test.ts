/**
 * s14-17: the timeout rule a socket hub can import. Active, expired, lifted and permanent rows, the 30-second cache,
 * and the shape of the query against the schema (`expiresAt` and `liftedAt` are optional columns).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { shapeChecked } from '@/lib/db/query-shape';
import {
  HUB_RESTRICTIONS_TTL_MS,
  activeRestrictionWhere,
  clearRestrictionCache,
  isRestrictedIn,
  peekRestrictedIn,
  pickActiveRestriction,
  type RestrictionDb,
} from '@/lib/moderation/restrictions-core';

const DAY = 24 * 60 * 60 * 1000;
const T0 = new Date('2027-01-10T12:00:00Z');

interface Row {
  userId: string;
  feature: string;
  expiresAt: Date | null;
  liftedAt: Date | null;
}

/** A fake that applies `activeRestrictionWhere` the way Postgres would, so the rule itself is under test. */
function fakeDb(rows: Row[]) {
  const findMany = vi.fn(async (args: { where: ReturnType<typeof activeRestrictionWhere> }) => {
    const w = args.where;
    const now = (w.OR?.[1] as { expiresAt: { gt: Date } }).expiresAt.gt;
    return rows
      .filter((r) => r.userId === w.userId && r.liftedAt === null && (r.expiresAt === null || r.expiresAt > now))
      .map((r) => ({ feature: r.feature, expiresAt: r.expiresAt }));
  });
  const db = shapeChecked({ featureRestriction: { findMany } }) as unknown as RestrictionDb;
  return { db, findMany };
}

const row = (over: Partial<Row>): Row => ({
  userId: 'u1',
  feature: 'message',
  expiresAt: new Date(T0.getTime() + DAY),
  liftedAt: null,
  ...over,
});

beforeEach(() => clearRestrictionCache());

describe('isRestrictedIn', () => {
  it('refuses while a timed row is active', async () => {
    const { db } = fakeDb([row({})]);
    expect(await isRestrictedIn(db, 'u1', 'message', T0)).toBe(true);
  });

  it('refuses a permanent row', async () => {
    const { db } = fakeDb([row({ expiresAt: null })]);
    expect(await isRestrictedIn(db, 'u1', 'message', T0)).toBe(true);
  });

  it('lets through an expired row, a lifted row, another feature and another member', async () => {
    const { db } = fakeDb([
      row({ expiresAt: new Date(T0.getTime() - 1) }),
      row({ liftedAt: new Date(T0.getTime() - 1000), expiresAt: null }),
      row({ feature: 'post' }),
      row({ userId: 'u2' }),
    ]);
    expect(await isRestrictedIn(db, 'u1', 'message', T0)).toBe(false);
  });

  it('asks only for unlifted, unexpired rows of the member, by the shared rule', async () => {
    const { db, findMany } = fakeDb([]);
    await isRestrictedIn(db, 'u1', 'message', T0);
    expect(findMany).toHaveBeenCalledWith({
      where: activeRestrictionWhere('u1', T0),
      select: { feature: true, expiresAt: true },
    });
    expect(activeRestrictionWhere('u1', T0)).toEqual({
      userId: 'u1',
      liftedAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: T0 } }],
    });
  });

  it('reads once per member per 30 seconds, then again', async () => {
    const { db, findMany } = fakeDb([]);
    await isRestrictedIn(db, 'u1', 'message', T0);
    await isRestrictedIn(db, 'u1', 'comment', new Date(T0.getTime() + HUB_RESTRICTIONS_TTL_MS - 1));
    expect(findMany).toHaveBeenCalledTimes(1);
    await isRestrictedIn(db, 'u1', 'message', new Date(T0.getTime() + HUB_RESTRICTIONS_TTL_MS));
    expect(findMany).toHaveBeenCalledTimes(2);
    await isRestrictedIn(db, 'u2', 'message', T0);
    expect(findMany).toHaveBeenCalledTimes(3);
  });

  it('a timeout that ends inside the cache window stops refusing at its end', async () => {
    const end = new Date(T0.getTime() + 5_000);
    const { db, findMany } = fakeDb([row({ expiresAt: end })]);
    expect(await isRestrictedIn(db, 'u1', 'message', T0)).toBe(true);
    expect(await isRestrictedIn(db, 'u1', 'message', new Date(end.getTime() + 1))).toBe(false);
    expect(findMany).toHaveBeenCalledTimes(1);
  });

  it('does not cache a failed read', async () => {
    const findMany = vi.fn().mockRejectedValueOnce(new Error('db down')).mockResolvedValue([]);
    const db = { featureRestriction: { findMany } } as unknown as RestrictionDb;
    await expect(isRestrictedIn(db, 'u1', 'message', T0)).rejects.toThrow('db down');
    expect(peekRestrictedIn('u1', 'message', T0)).toBeUndefined();
    expect(await isRestrictedIn(db, 'u1', 'message', T0)).toBe(false);
  });
});

describe('peekRestrictedIn', () => {
  it('is undefined before a read and answers from the cache after it', async () => {
    const { db } = fakeDb([row({})]);
    expect(peekRestrictedIn('u1', 'message', T0)).toBeUndefined();
    await isRestrictedIn(db, 'u1', 'message', T0);
    expect(peekRestrictedIn('u1', 'message', T0)).toBe(true);
    expect(peekRestrictedIn('u1', 'post', T0)).toBe(false);
    expect(peekRestrictedIn('u1', 'message', new Date(T0.getTime() + HUB_RESTRICTIONS_TTL_MS))).toBeUndefined();
  });

  it('clearRestrictionCache forgets one member or all', async () => {
    const { db } = fakeDb([]);
    await isRestrictedIn(db, 'u1', 'message', T0);
    await isRestrictedIn(db, 'u2', 'message', T0);
    clearRestrictionCache('u1');
    expect(peekRestrictedIn('u1', 'message', T0)).toBeUndefined();
    expect(peekRestrictedIn('u2', 'message', T0)).toBe(false);
    clearRestrictionCache();
    expect(peekRestrictedIn('u2', 'message', T0)).toBeUndefined();
  });
});

describe('pickActiveRestriction', () => {
  it('the longest wins and a permanent one beats a timed one', () => {
    const t = T0.getTime();
    expect(
      pickActiveRestriction(
        [
          { feature: 'post', expiresAt: t + 10 },
          { feature: 'post', expiresAt: t + 99 },
        ],
        'post',
        t,
      ),
    ).toEqual({
      expiresAt: new Date(t + 99),
    });
    expect(
      pickActiveRestriction(
        [
          { feature: 'post', expiresAt: t + 10 },
          { feature: 'post', expiresAt: null },
        ],
        'post',
        t,
      ),
    ).toEqual({
      expiresAt: null,
    });
    expect(pickActiveRestriction([{ feature: 'post', expiresAt: t - 1 }], 'post', t)).toBeNull();
  });
});
