import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Subscribing to an RMHTube host (s13-07): yourself, blocked, banned, pending-deletion and erased hosts are refused;
 * the 200-host cap is counted under the member's advisory lock; subscribing and unsubscribing twice is harmless; the
 * lists carry no counts and no subscribers; the export names hosts as they are now.
 */

const NOW = new Date('2026-12-01T12:00:00Z');
const FUTURE = new Date('2026-12-10T00:00:00Z');

const db = vi.hoisted(() => ({
  users: new Map<string, { id: string; bannedUntil: Date | null; deletionScheduledAt: Date | null }>(),
  blocks: [] as { blockerId: string; blockedId: string }[],
  subs: [] as { id: string; subscriberId: string; channelId: string; createdAt: Date }[],
  events: [] as string[],
}));

vi.mock('@/lib/jobs/boss.server', () => ({ getBoss: async () => null }));
vi.mock('@/lib/notifications.server', () => ({ createNotification: vi.fn() }));
vi.mock('@/lib/prisma.server', () => {
  const subTable = (log: boolean) => ({
    findUnique: async ({
      where,
    }: {
      where: { subscriberId_channelId: { subscriberId: string; channelId: string } };
    }) => {
      const k = where.subscriberId_channelId;
      const hit = db.subs.find((s) => s.subscriberId === k.subscriberId && s.channelId === k.channelId);
      return hit ? { id: hit.id } : null;
    },
    count: async ({ where }: { where: { subscriberId: string } }) => {
      if (log) db.events.push('count');
      return db.subs.filter((s) => s.subscriberId === where.subscriberId).length;
    },
    create: async ({ data }: { data: { subscriberId: string; channelId: string } }) => {
      db.subs.push({ id: `s${db.subs.length}`, createdAt: NOW, ...data });
      return {};
    },
    deleteMany: async ({ where }: { where: { subscriberId: string; channelId: string } }) => {
      const before = db.subs.length;
      db.subs = db.subs.filter((s) => !(s.subscriberId === where.subscriberId && s.channelId === where.channelId));
      return { count: before - db.subs.length };
    },
    findMany: async ({ where }: { where: { subscriberId: string } }) =>
      db.subs
        .filter((s) => s.subscriberId === where.subscriberId)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .map((s) => ({
          channelId: s.channelId,
          createdAt: s.createdAt,
          channel: {
            id: s.channelId,
            name: `Name ${s.channelId}`,
            handle: `h-${s.channelId}`,
            image: null,
            username: null,
            profile: null,
            inventory: [],
            ...db.users.get(s.channelId),
          },
        })),
  });
  const tx = {
    $executeRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      db.events.push(`lock:${strings.join('?')}:${String(values[0])}`);
      return 1;
    },
    rmhTubeSubscription: subTable(true),
  };
  return {
    prisma: {
      user: { findUnique: async ({ where }: { where: { id: string } }) => db.users.get(where.id) ?? null },
      userBlock: {
        findFirst: async ({ where }: { where: { OR: { blockerId: string; blockedId: string }[] } }) =>
          db.blocks.find((b) => where.OR.some((c) => c.blockerId === b.blockerId && c.blockedId === b.blockedId)) ??
          null,
        findMany: async () => db.blocks,
      },
      rmhTubeSubscription: subTable(false),
      $transaction: async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
    },
  };
});

import {
  exportTubeSubscriptions,
  listMySubscriptions,
  subscribeToHost,
  unsubscribeFromHost,
} from '@/lib/rmhtube/subscriptions.server';
import { MAX_TUBE_SUBSCRIPTIONS, atSubscriptionCap, isHostReachable } from '@/lib/rmhtube/subscriptions';
import { ERROR_CODES } from '@/lib/errors/codes';

const user = (id: string, over: Partial<{ bannedUntil: Date | null; deletionScheduledAt: Date | null }> = {}) =>
  db.users.set(id, { id, bannedUntil: null, deletionScheduledAt: null, ...over });

beforeEach(() => {
  db.users.clear();
  db.blocks = [];
  db.subs = [];
  db.events = [];
  user('me');
  user('host');
});

describe('subscribing', () => {
  it('follows a host, and following twice is the same as once', async () => {
    expect(await subscribeToHost('me', 'host', NOW)).toEqual({ ok: true, subscribed: true });
    expect(await subscribeToHost('me', 'host', NOW)).toEqual({ ok: true, subscribed: true });
    expect(db.subs).toHaveLength(1);
    expect(db.subs[0]).toMatchObject({ subscriberId: 'me', channelId: 'host' });
  });

  it('refuses yourself, an unknown member, and a banned, erased or pending-deletion host', async () => {
    expect(await subscribeToHost('me', 'me', NOW)).toEqual({ ok: false, code: 'TUBE_SUBSCRIBE_SELF' });
    expect(await subscribeToHost('me', 'nobody', NOW)).toEqual({ ok: false, code: 'NOT_FOUND' });
    user('banned', { bannedUntil: FUTURE });
    // An erased account is locked until a date far ahead.
    user('erased', { bannedUntil: new Date('2126-01-01T00:00:00Z') });
    user('leaving', { deletionScheduledAt: NOW });
    for (const id of ['banned', 'erased', 'leaving'])
      expect(await subscribeToHost('me', id, NOW)).toEqual({ ok: false, code: 'NOT_FOUND' });
    user('lapsed', { bannedUntil: new Date('2026-11-01T00:00:00Z') });
    expect(await subscribeToHost('me', 'lapsed', NOW)).toMatchObject({ ok: true });
    expect(db.subs.map((s) => s.channelId)).toEqual(['lapsed']);
  });

  it('refuses a host blocked in either direction, with the same answer as an unknown member', async () => {
    db.blocks = [{ blockerId: 'host', blockedId: 'me' }];
    expect(await subscribeToHost('me', 'host', NOW)).toEqual({ ok: false, code: 'NOT_FOUND' });
    db.blocks = [{ blockerId: 'me', blockedId: 'host' }];
    expect(await subscribeToHost('me', 'host', NOW)).toEqual({ ok: false, code: 'NOT_FOUND' });
    expect(db.subs).toHaveLength(0);
  });

  it("counts the cap under the member's advisory lock and refuses the 201st host", async () => {
    for (let i = 0; i < MAX_TUBE_SUBSCRIPTIONS; i++)
      db.subs.push({ id: `p${i}`, subscriberId: 'me', channelId: `other${i}`, createdAt: NOW });
    db.events = [];
    expect(await subscribeToHost('me', 'host', NOW)).toEqual({
      ok: false,
      code: 'TUBE_SUBSCRIBE_LIMIT',
      max: MAX_TUBE_SUBSCRIPTIONS,
    });
    expect(db.events[0]).toContain('pg_advisory_xact_lock');
    expect(db.events[0]).toContain('tube-subscriptions:me');
    expect(db.events.indexOf('count')).toBeGreaterThan(0);
    // Already following one of the 200: the same request is still a quiet success.
    db.subs[0]!.channelId = 'host';
    expect(await subscribeToHost('me', 'host', NOW)).toEqual({ ok: true, subscribed: true });
    expect(db.subs).toHaveLength(MAX_TUBE_SUBSCRIPTIONS);
  });
});

describe('unsubscribing', () => {
  it("is idempotent and touches only the caller's own row", async () => {
    db.subs = [
      { id: 'a', subscriberId: 'me', channelId: 'host', createdAt: NOW },
      { id: 'b', subscriberId: 'other', channelId: 'host', createdAt: NOW },
    ];
    await unsubscribeFromHost('me', 'host');
    await unsubscribeFromHost('me', 'host');
    await unsubscribeFromHost('me', 'never-followed');
    expect(db.subs.map((s) => s.id)).toEqual(['b']);
  });
});

describe('what a member can read', () => {
  it('lists the hosts they follow with names now, leaving out banned, pending-deletion and blocked hosts', async () => {
    user('banned', { bannedUntil: FUTURE });
    user('leaving', { deletionScheduledAt: NOW });
    user('blocked');
    db.blocks = [{ blockerId: 'blocked', blockedId: 'me' }];
    db.subs = ['host', 'banned', 'leaving', 'blocked'].map((c, i) => ({
      id: `s${i}`,
      subscriberId: 'me',
      channelId: c,
      createdAt: new Date(NOW.getTime() - i * 1000),
    }));
    const hosts = await listMySubscriptions('me', NOW);
    expect(hosts).toEqual([{ id: 'host', name: 'Name host', handle: 'h-host' }]);
    // No counts and no subscriber lists anywhere in the answer.
    expect(JSON.stringify(hosts)).not.toMatch(/count|subscriber/i);
  });

  it('exports the hosts the member follows, named as they are now', async () => {
    db.subs = [{ id: 'a', subscriberId: 'me', channelId: 'host', createdAt: NOW }];
    expect(await exportTubeSubscriptions('me')).toEqual([
      { hostId: 'host', name: 'Name host', handle: 'h-host', subscribedAt: NOW.toISOString() },
    ]);
    expect(await exportTubeSubscriptions('nobody')).toEqual([]);
  });
});

describe('the pure rules and the refusal codes', () => {
  it('the cap is 200 and reachability follows the ban and the deletion request', () => {
    expect(atSubscriptionCap(199)).toBe(false);
    expect(atSubscriptionCap(200)).toBe(true);
    expect(isHostReachable({ bannedUntil: null, deletionScheduledAt: null }, NOW)).toBe(true);
    expect(isHostReachable({ bannedUntil: FUTURE, deletionScheduledAt: null }, NOW)).toBe(false);
    expect(isHostReachable({ bannedUntil: null, deletionScheduledAt: NOW }, NOW)).toBe(false);
  });

  it('names its two refusals in the taxonomy', () => {
    expect(ERROR_CODES.TUBE_SUBSCRIBE_SELF.http).toBe(400);
    expect(ERROR_CODES.TUBE_SUBSCRIBE_LIMIT.text).toContain('{{max}}');
  });
});
