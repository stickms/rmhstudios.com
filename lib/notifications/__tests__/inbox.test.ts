import { beforeEach, describe, expect, it, vi } from 'vitest';

// The inbox's per-item actions touch a member's own data and the unread badge counter, so the rules are held here:
// every where carries userId (a foreign id changes nothing), the counter moves by exactly the rows that changed, a
// filtered mark-all touches only that filter's types, and a batch is capped at 100.

interface Row {
  id: string;
  userId: string;
  type: string;
  read: boolean;
  createdAt: Date;
}
interface Where {
  userId?: string;
  id?: {
    in: string[];
  };
  read?: boolean;
  type?: {
    in: string[];
  };
}

const db = vi.hoisted(() => ({
  rows: [] as Row[],
  where: [] as unknown[],
}));
const counter = vi.hoisted(() => ({
  value: null as number | null,
}));

function match(w: Where): Row[] {
  db.where.push(w);
  return db.rows.filter(
    (r) =>
      (w.userId === undefined || r.userId === w.userId) &&
      (!w.id || w.id.in.includes(r.id)) &&
      (w.read === undefined || r.read === w.read) &&
      (!w.type || w.type.in.includes(r.type)),
  );
}

vi.mock('@/lib/prisma.server', () => ({
  prisma: {
    notification: {
      updateMany: vi.fn(
        async ({
          where,
          data,
        }: {
          where: Where;
          data: {
            read: boolean;
          };
        }) => {
          const hit = match(where);
          for (const r of hit) r.read = data.read;
          return {
            count: hit.length,
          };
        },
      ),
      deleteMany: vi.fn(async ({ where }: { where: Where }) => {
        const hit = match(where);
        db.rows = db.rows.filter((r) => !hit.includes(r));
        return {
          count: hit.length,
        };
      }),
      count: vi.fn(async ({ where }: { where: Where }) => match(where).length),
    },
  },
}));
vi.mock('@/lib/cached.server', () => ({
  cachedNullable: (_k: string, _t: number, load: () => Promise<unknown>) => load(),
  invalidateCached: vi.fn(),
}));
vi.mock('@/lib/redis.server', () => ({
  redisEnabled: () => true,
  redisGetJSON: vi.fn(async () => counter.value),
  redisSetJSON: vi.fn(),
  redisIncrBy: vi.fn(async (_k: string, delta: number) => {
    counter.value = Math.max(0, (counter.value ?? 0) + delta);
    return counter.value;
  }),
}));
vi.mock('@/lib/push/send.server', () => ({
  sendPushToUser: vi.fn(),
  pushTitleFor: () => '',
  pushActionsFor: () => undefined,
}));
vi.mock('@/lib/notify/held.server', () => ({
  holdNotification: vi.fn(),
}));

const { setRead, dismiss, markAllRead } = await import('@/lib/notifications/inbox.server');
const { dismissBody, setReadBody, listQuery, splitUnreadIds } = await import('@/lib/notifications/inbox-schema');

const row = (id: string, userId: string, type: string, read: boolean): Row => ({
  id,
  userId,
  type,
  read,
  createdAt: new Date(),
});

beforeEach(() => {
  db.where.length = 0;
  db.rows = [
    row('a', 'me', 'REPLY', false),
    row('b', 'me', 'LIKE', false),
    row('c', 'me', 'FOLLOW', true),
    row('d', 'me', 'MENTION', false),
    row('x', 'other', 'REPLY', false),
  ];
  counter.value = 3;
});

describe('setRead', () => {
  it('answers not found for a foreign id and changes nothing', async () => {
    const res = await setRead('me', ['x'], true);
    expect(res).toEqual({
      found: 0,
      changed: 0,
    });
    expect(db.rows.find((r) => r.id === 'x')?.read).toBe(false);
    expect(counter.value).toBe(3);
  });

  it('puts userId in every where', async () => {
    await setRead('me', ['a', 'x'], true);
    expect(db.where.every((w) => (w as Where).userId === 'me')).toBe(true);
  });

  it('moves the counter by one when an item is marked unread, and back when read', async () => {
    const unread = await setRead('me', ['c'], false);
    expect(unread).toEqual({
      found: 1,
      changed: 1,
    });
    expect(counter.value).toBe(4);
    await setRead('me', ['c'], true);
    expect(counter.value).toBe(3);
  });

  it('does not move the counter for rows already in that state', async () => {
    const res = await setRead('me', ['a', 'c'], true);
    expect(res).toEqual({
      found: 2,
      changed: 1,
    });
    expect(counter.value).toBe(2);
  });
});

describe('dismiss', () => {
  it('answers not found for a foreign id and keeps the row', async () => {
    const res = await dismiss('me', ['x']);
    expect(res.found).toBe(0);
    expect(db.rows.some((r) => r.id === 'x')).toBe(true);
    expect(counter.value).toBe(3);
  });

  it('lowers the counter only by the unread rows deleted', async () => {
    const res = await dismiss('me', ['a', 'c', 'x']);
    expect(res).toEqual({
      found: 2,
      changed: 2,
    });
    expect(db.rows.map((r) => r.id)).toEqual(['b', 'd', 'x']);
    expect(counter.value).toBe(2);
  });
});

describe('markAllRead', () => {
  it("with a filter touches only that filter's types", async () => {
    const updated = await markAllRead('me', 'mentions');
    expect(updated).toBe(2);
    expect(db.rows.find((r) => r.id === 'b')?.read).toBe(false);
    expect(db.rows.find((r) => r.id === 'x')?.read).toBe(false);
    expect(counter.value).toBe(1);
  });

  it("without a filter marks all of the caller's unread rows", async () => {
    expect(await markAllRead('me')).toBe(3);
    expect(counter.value).toBe(0);
    expect(db.rows.find((r) => r.id === 'x')?.read).toBe(false);
  });

  it('with "all" has no type constraint', async () => {
    await markAllRead('me', 'all');
    expect((db.where[0] as Where).type).toBeUndefined();
  });
});

describe('batch caps', () => {
  const ids = (n: number) =>
    Array.from(
      {
        length: n,
      },
      (_, i) => `n${i}`,
    );

  it('accepts a group of 100 and rejects 101 or none', () => {
    expect(
      dismissBody.safeParse({
        ids: ids(100),
      }).success,
    ).toBe(true);
    expect(
      dismissBody.safeParse({
        ids: ids(101),
      }).success,
    ).toBe(false);
    expect(
      dismissBody.safeParse({
        ids: [],
      }).success,
    ).toBe(false);
  });

  it('requires a boolean read flag', () => {
    expect(
      setReadBody.safeParse({
        read: false,
      }).success,
    ).toBe(true);
    expect(setReadBody.safeParse({}).success).toBe(false);
  });

  it('validates the list query: known filter, at most 100 well-formed unreadIds', () => {
    expect(
      listQuery.safeParse({
        filter: 'mentions',
        unread: 'true',
        unreadIds: ids(100).join(','),
      }).success,
    ).toBe(true);
    expect(
      listQuery.safeParse({
        unreadIds: ids(101).join(','),
      }).success,
    ).toBe(false);
    expect(
      listQuery.safeParse({
        unreadIds: 'a,,b',
      }).success,
    ).toBe(false);
    expect(
      listQuery.safeParse({
        unreadIds: `a,${'b'.repeat(65)}`,
      }).success,
    ).toBe(false);
    expect(
      listQuery.safeParse({
        filter: 'nope',
      }).success,
    ).toBe(false);
    expect(
      listQuery.safeParse({
        limit: '51',
      }).success,
    ).toBe(false);
    expect(splitUnreadIds('a,b,a')).toEqual(['a', 'b']);
    expect(splitUnreadIds(undefined)).toEqual([]);
  });
});
