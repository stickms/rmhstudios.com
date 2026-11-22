import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handlersOfModule } from '@/lib/__tests__/api-handlers-of';
import { createFakeDb, type FakeEvent, type FakeRsvp } from './fake-waitlist-db';

// Sprint 07 integration (s07-10 TODO): a member banned or timed out of a community cannot RSVP to that
// community's events. The check is in the site's `rsvp`, which the site route and
// PUT /api/v1/events/{id}/rsvp both call; withdrawing stays open.

const h = vi.hoisted(() => ({
  fake: null as ReturnType<typeof import('./fake-waitlist-db').createFakeDb> | null,
  sanction: null as null | { id: string; kind: 'ban' | 'timeout'; endsAt: Date | null; ruleId: string | null },
  sanctionCalls: [] as [string, string][],
  rsvpRecurring: vi.fn(),
}));

vi.mock('@/lib/prisma.server', () => ({
  prisma: new Proxy({}, { get: (_t, key: string) => (h.fake!.db as unknown as Record<string, unknown>)[key] }),
}));
vi.mock('@/lib/communities/sanction-read.server', () => ({
  activeSanction: async (communityId: string, userId: string) => {
    h.sanctionCalls.push([communityId, userId]);
    return h.sanction;
  },
}));
vi.mock('@/lib/auth', () => ({
  auth: { api: { getSession: async () => ({ user: { id: 'm', name: 'M', isAdmin: false } }) } },
}));
vi.mock('@/lib/redis.server', () => ({
  redisEnabled: () => false,
  redisGetJSON: vi.fn(),
  redisSetJSON: vi.fn(),
  redisRateLimit: vi.fn(async () => null),
}));
vi.mock('@/lib/jobs/boss.server', () => ({ getBoss: async () => null }));
vi.mock('@/lib/notifications.server', () => ({ createNotification: vi.fn(async () => {}) }));
vi.mock('@/lib/communities/access.server', () => ({ getRole: vi.fn(), canModerate: vi.fn() }));
vi.mock('@/lib/calendar/recurring-events.server', () => ({
  OccurrenceError: class OccurrenceError extends Error {},
  activeSeriesWhere: {},
  checkRecurrence: vi.fn(),
  decorateRecurring: vi.fn(),
  isGoingToOccurrence: vi.fn(),
  notifyRotation: vi.fn(),
  occurrenceAfter: vi.fn(),
  rsvpRecurring: h.rsvpRecurring,
  unrsvpRecurring: vi.fn(),
  upcomingOccurrenceEventIds: vi.fn(),
}));
vi.mock('@/lib/user-display', () => ({
  userDisplaySelect: {},
  resolveUser: (u: { id: string; name?: string }) => ({ id: u.id, name: u.name ?? null, image: null, handle: null }),
}));

import { EventError, rsvp, unrsvp } from '@/lib/events.server';

const FUTURE = new Date(Date.now() + 7 * 86_400_000);
const UNTIL = new Date(Date.now() + 3 * 86_400_000);

function setup(over: { communityId: string | null; recurrence?: string | null }, rsvps: Partial<FakeRsvp>[] = []) {
  const first: FakeEvent = {
    id: 'e1',
    hostId: 'host',
    title: 'Game night',
    startsAt: FUTURE,
    capacity: null,
    canceledAt: null,
    recurrence: over.recurrence ?? null,
  };
  h.fake = createFakeDb({ events: [first], rsvps });
  const row = {
    ...first,
    kind: 'event',
    communityId: over.communityId,
    visibility: 'PUBLIC',
    pollId: null,
    endsAt: null,
    recurUntil: null,
    recurTz: null,
    rotatingHostIds: [],
    venueKind: 'URL',
    venueRef: 'https://example.com',
    href: null,
    description: '',
    createdAt: new Date(0),
    host: { id: 'host', name: 'Host' },
    community: null,
    owner: over.communityId ? 'COMMUNITY' : 'USER',
  };
  const db = h.fake.db as unknown as Record<string, Record<string, unknown>>;
  const ev = db.event!;
  const dbFind = ev.findUnique as (a: { where: { id: string } }) => Promise<unknown>;
  ev.findUnique = async (a: { where: { id: string } }) => {
    const live = await dbFind(a);
    return live ? { ...row, ...(live as object), communityId: over.communityId } : null;
  };
  ev.findFirst = async () => ({ ...row, ...h.fake!.events.get('e1')!, communityId: over.communityId });
  // A public community: anyone may see its events.
  db.community = { findUnique: async () => ({ isPrivate: false, members: [] }) };
  return h.fake;
}

beforeEach(() => {
  h.sanction = null;
  h.sanctionCalls = [];
  h.rsvpRecurring.mockReset();
});

describe('RSVP to a community event under a sanction', () => {
  it('refuses a banned member with the ban, and writes no answer', async () => {
    const f = setup({ communityId: 'c1' });
    h.sanction = { id: 'b1', kind: 'ban', endsAt: null, ruleId: null };
    const err = await rsvp('e1', 'm', 'going').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(EventError);
    expect(err).toMatchObject({ code: 'COMMUNITY_SANCTIONED', sanction: { kind: 'ban', endsAt: null } });
    expect(h.sanctionCalls).toEqual([['c1', 'm']]);
    expect(f.rows).toEqual([]);
  });

  it('refuses a timed-out member, for going, maybe and the waitlist', async () => {
    const f = setup({ communityId: 'c1' });
    const endsAt = new Date(Date.now() + 3_600_000);
    h.sanction = { id: 'b2', kind: 'timeout', endsAt, ruleId: null };
    for (const status of ['going', 'maybe', 'waitlist'] as const) {
      await expect(rsvp('e1', 'm', status)).rejects.toMatchObject({
        code: 'COMMUNITY_SANCTIONED',
        sanction: { kind: 'timeout', endsAt },
      });
    }
    expect(f.rows).toEqual([]);
  });

  it('refuses before a repeating event records anything', async () => {
    setup({ communityId: 'c1', recurrence: 'WEEKLY' });
    h.sanction = { id: 'b3', kind: 'ban', endsAt: UNTIL, ruleId: null };
    await expect(rsvp('e1', 'm', 'going', { everyTime: true })).rejects.toMatchObject({ code: 'COMMUNITY_SANCTIONED' });
    expect(h.rsvpRecurring).not.toHaveBeenCalled();
  });

  it('lets a member with no sanction answer', async () => {
    const f = setup({ communityId: 'c1' });
    expect(await rsvp('e1', 'm', 'going')).toMatchObject({ viewerRsvp: 'going' });
    expect(f.rows.map((r) => r.userId)).toEqual(['m']);
  });

  it('does not look up a sanction for an event outside a community', async () => {
    setup({ communityId: null });
    h.sanction = { id: 'b4', kind: 'ban', endsAt: null, ruleId: null };
    expect(await rsvp('e1', 'm', 'going')).toMatchObject({ viewerRsvp: 'going' });
    expect(h.sanctionCalls).toEqual([]);
  });

  it('still lets a sanctioned member take an answer back', async () => {
    const f = setup({ communityId: 'c1' }, [{ userId: 'm' }]);
    h.sanction = { id: 'b5', kind: 'ban', endsAt: null, ruleId: null };
    expect(await unrsvp('e1', 'm')).toMatchObject({ viewerRsvp: null });
    expect(f.rows).toEqual([]);
  });
});

describe('POST /api/events/$id/rsvp', () => {
  type Handler = (a: { request: Request; params: Record<string, string> }) => Promise<Response>;
  const post = async (body: unknown) => {
    const mod = await import('@/lib/api/routes/events.$id.rsvp.server');
    const fn = handlersOfModule<Handler>(mod).POST!;
    return fn({
      params: { id: 'e1' },
      request: new Request('https://rmhstudios.com/api/events/e1/rsvp', {
        method: 'POST',
        headers: {
          cookie: 'better-auth.session_token=abc',
          'content-type': 'application/json',
          'cf-connecting-ip': `${Math.random()}`,
        },
        body: JSON.stringify(body),
      }),
    });
  };

  it('answers the community refusal body the composer and join paths use', async () => {
    setup({ communityId: 'c1' });
    const endsAt = new Date('2026-12-01T14:30:00Z');
    h.sanction = { id: 'b6', kind: 'ban', endsAt, ruleId: null };
    const res = await post({ status: 'going' });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({
      error: 'You are banned from this community until 1 Dec 2026, 14:30 UTC.',
      code: 'community_banned',
      endsAt: endsAt.toISOString(),
    });
  });
});
