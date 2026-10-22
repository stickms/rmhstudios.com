/**
 * Private communities are members-only.
 *
 * `isPrivate` was honoured by search, the sitemap and the "plus" routes
 * (`requireReadable`), but the community page loader, feed, browse list, extras,
 * members, announcements and pages read paths never checked it, and `join` let
 * anyone become a member. A non-member now gets the same outcome as for a
 * missing community (404 / null / not listed), so existence does not leak.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  community: { findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn() },
  member: { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(), delete: vi.fn() },
  announcement: { findMany: vi.fn() },
  joinRequest: { findUnique: vi.fn(), findMany: vi.fn() },
  page: { findUnique: vi.fn() },
  rmhark: { findMany: vi.fn() },
  event: { findUnique: vi.fn(), findMany: vi.fn() },
  rsvp: { groupBy: vi.fn(), findMany: vi.fn() },
  getSession: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock('@/lib/prisma.server', () => ({
  prisma: {
    community: h.community,
    communityMember: h.member,
    communityAnnouncement: h.announcement,
    communityJoinRequest: h.joinRequest,
    communityPage: h.page,
    user: { findUnique: async () => null },
    rMHark: h.rmhark,
    communityEvent: h.event,
    eventRsvp: h.rsvp,
    closeFriend: { findMany: async () => [] },
    $transaction: h.transaction,
  },
}));
vi.mock('@/lib/notifications.server', () => ({ createNotification: vi.fn() }));
vi.mock('@/lib/jobs/boss.server', () => ({ getBoss: async () => null }));
vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: h.getSession } } }));
vi.mock('@/lib/calendar/recurring-events.server', () => ({
  OccurrenceError: class extends Error {},
  activeSeriesWhere: () => ({}),
  checkRecurrence: vi.fn(),
  decorateRecurring: async (m: unknown) => m,
  isGoingToOccurrence: vi.fn(),
  notifyRotation: vi.fn(),
  occurrenceAfter: vi.fn(),
  rsvpRecurring: vi.fn(),
  unrsvpRecurring: vi.fn(),
  upcomingOccurrenceEventIds: async () => [],
}));
vi.mock('@/lib/api/handler.server', () => ({
  defineHandler: (_o: unknown, fn: (c: unknown) => unknown) => fn,
}));
vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (config: unknown) => ({ options: config }),
}));
vi.mock('@/lib/feed/map-feed-item.server', () => ({
  rmharkIncludeLite: () => ({}),
  mapRmharksWithBoundedReactions: async () => [],
}));
vi.mock('@/lib/social/follow-graph.server', () => ({ getFollowingIds: async () => [] }));
vi.mock('@/lib/moderation.server', () => ({ getHiddenAuthorIds: async () => [] }));
vi.mock('@/lib/communities/flairs.server', () => ({
  loadFlairsForPosts: async () => new Map(),
  listFlairs: async () => [],
}));
vi.mock('@/lib/communities/sisters.server', () => ({ getSisters: async () => [] }));
vi.mock('@/lib/communities/onboarding.server', () => ({ getUnansweredQuestions: async () => [] }));
vi.mock('@/lib/communities/settings.server', () => ({
  getCommunitySettings: async () => ({ verification: { level: 'none', value: 0 } }),
}));
vi.mock('@/lib/communities/pages.server', () => ({
  listRevisions: async () => [{ id: '1' }],
  listCommunityPages: async () => [{ id: 'p' }],
  getCommunityPage: async () => ({ id: 'p' }),
  createCommunityPage: vi.fn(),
  CommunityPageError: class extends Error {},
}));

import { getCommunity, getCommunityFeed } from '@/lib/community.server';
import { listCommunities } from '@/lib/communities.server';
import { getCommunityExtras } from '@/lib/communities/extras.server';
import { getEvent, listEvents, rsvp } from '@/lib/events.server';

const PRIVATE = { id: 'c1', isPrivate: true, createdById: 'owner', slug: 's' };
const session = (id: string) => ({ session: { user: { id } }, userId: id });

type Handler = (ctx: Record<string, unknown>) => Promise<Response>;
async function routeHandlers(mod: string, method: string): Promise<Handler> {
  const m = (await import(/* @vite-ignore */ mod)) as {
    Route: { options: { server: { handlers: Record<string, Handler> } } };
  };
  return m.Route.options.server.handlers[method];
}

beforeEach(() => {
  for (const g of Object.values(h)) {
    if (typeof g === 'function') (g as ReturnType<typeof vi.fn>).mockReset();
    else for (const fn of Object.values(g)) (fn as ReturnType<typeof vi.fn>).mockReset();
  }
  h.community.findUnique.mockResolvedValue({
    ...PRIVATE,
    name: 'N',
    description: null,
    icon: null,
    color: null,
    memberCount: 3,
    postCount: 1,
    createdAt: new Date(),
    flairRequired: false,
    starThreshold: 3,
    verificationLevel: 'none',
    verificationValue: 0,
  });
  h.member.findUnique.mockResolvedValue(null); // viewer is NOT a member by default
  h.community.findMany.mockResolvedValue([]);
  h.announcement.findMany.mockResolvedValue([]);
  h.rmhark.findMany.mockResolvedValue([]);
});

describe('community detail + feed (SSR loader and API)', () => {
  it('a non-member and an anonymous viewer get the locked preview: metadata only', async () => {
    for (const viewer of ['stranger', null]) {
      const c = await getCommunity('s', viewer);
      expect(c).toMatchObject({ locked: true, joined: false, role: null, announcements: [], postCount: 0 });
      expect(c?.name).toBe('N');
      expect(c?.memberCount).toBe(3);
    }
    // no content query is made for them
    expect(h.announcement.findMany).not.toHaveBeenCalled();
  });

  it('a member gets the full community', async () => {
    h.member.findUnique.mockResolvedValue({ role: 'MEMBER' });
    const c = await getCommunity('s', 'me');
    expect(c).toMatchObject({ slug: 's', locked: false, joined: true });
    expect(h.announcement.findMany).toHaveBeenCalledTimes(1);
  });

  it('feed: null for a non-member (no post query is made), posts for a member', async () => {
    expect(await getCommunityFeed('s', 'stranger')).toBeNull();
    expect(await getCommunityFeed('s', null)).toBeNull();
    expect(h.rmhark.findMany).not.toHaveBeenCalled();
    h.member.findUnique.mockResolvedValue({ followedFlairIds: [] });
    expect(await getCommunityFeed('s', 'me')).not.toBeNull();
    // the gate also holds on later pages (cursor), where membership used to be skipped
    h.member.findUnique.mockResolvedValue(null);
    expect(await getCommunityFeed('s', 'stranger', { cursor: 'x' })).toBeNull();
  });

  it('a public community is unchanged for everyone', async () => {
    h.community.findUnique.mockResolvedValue({ id: 'c2', isPrivate: false });
    expect(await getCommunityFeed('pub', null)).not.toBeNull();
  });
});

describe('browse list', () => {
  const row = (over: Record<string, unknown>) => ({
    id: 'c1',
    slug: 's',
    name: 'N',
    description: 'd',
    icon: null,
    color: null,
    memberCount: 3,
    postCount: 9,
    isPrivate: true,
    ...over,
  });

  it('lists private communities as locked cards with the post count withheld', async () => {
    h.community.findMany.mockResolvedValue([row({}), row({ id: 'c2', slug: 'p', isPrivate: false })]);
    const list = await listCommunities({ userId: null });
    expect(h.community.findMany.mock.calls[0][0].where).toEqual({});
    expect(list[0]).toMatchObject({ slug: 's', isPrivate: true, locked: true, postCount: 0, requestState: null });
    expect(list[1]).toMatchObject({ slug: 'p', locked: false, postCount: 9 });
  });

  it('a member sees their private community unlocked; a requester sees the pending state', async () => {
    h.community.findMany.mockResolvedValue([row({}), row({ id: 'c3', slug: 'q' })]);
    h.member.findMany.mockResolvedValue([{ role: 'MEMBER', community: { slug: 's' } }]);
    h.joinRequest.findMany.mockResolvedValue([{ communityId: 'c3', status: 'PENDING' }]);
    const list = await listCommunities({ userId: 'me' });
    expect(list[0]).toMatchObject({ slug: 's', locked: false, joined: true, postCount: 9 });
    expect(list[1]).toMatchObject({ slug: 'q', locked: true, requestState: 'PENDING' });
  });
});

describe('extras', () => {
  it('null for a non-member of a private community', async () => {
    h.community.findUnique.mockResolvedValue({ id: 'c1', isPrivate: true });
    expect(await getCommunityExtras('s', 'stranger')).toBeNull();
  });
});

describe('members / announcements / join / pages routes', () => {
  beforeEach(() => {
    h.community.findUnique.mockResolvedValue({ id: 'c1', createdById: 'owner', isPrivate: true });
  });

  it('members: 404 for a non-member, roster for a member', async () => {
    const GET = await routeHandlers('@/app/routes/api/communities/$slug/members', 'GET');
    expect((await GET({ params: { slug: 's' }, ...session('stranger') })).status).toBe(404);
    expect((await GET({ params: { slug: 's' }, session: null })).status).toBe(404);
    h.member.findUnique.mockResolvedValue({ role: 'MEMBER' });
    h.member.findMany.mockResolvedValue([]);
    expect((await GET({ params: { slug: 's' }, ...session('me') })).status).toBe(200);
  });

  it('announcements: 404 for a non-member, list for a member', async () => {
    const GET = await routeHandlers('@/app/routes/api/communities/$slug/announcements', 'GET');
    expect((await GET({ params: { slug: 's' }, ...session('stranger') })).status).toBe(404);
    expect((await GET({ params: { slug: 's' }, session: null })).status).toBe(404);
    expect(h.announcement.findMany).not.toHaveBeenCalled();
    h.member.findUnique.mockResolvedValue({ role: 'MOD' });
    expect((await GET({ params: { slug: 's' }, ...session('mod') })).status).toBe(200);
  });

  it('join: no invite means 404; a member can still leave', async () => {
    const POST = await routeHandlers('@/app/routes/api/communities/$slug/join', 'POST');
    h.transaction.mockResolvedValue([]);
    expect((await POST({ params: { slug: 's' }, ...session('stranger') })).status).toBe(404);
    expect(h.transaction).not.toHaveBeenCalled();
    h.member.findUnique.mockResolvedValue({ id: 'm1' });
    const res = await POST({ params: { slug: 's' }, ...session('me') });
    expect(res.status).toBe(200);
    expect(h.transaction).toHaveBeenCalledTimes(1);
  });

  it('pages index + revisions: 404 for a non-member of a private community', async () => {
    const LIST = await routeHandlers('@/app/routes/api/community-pages/index', 'GET');
    expect(
      (await LIST({ query: { communitySlug: 's' }, userId: 'stranger', isAdmin: false })).status,
    ).toBe(404);
    expect(
      (await LIST({ query: { communityId: 'c1' }, userId: null, isAdmin: false })).status,
    ).toBe(404);
    h.member.findUnique.mockResolvedValue({ role: 'MEMBER' });
    expect(
      (await LIST({ query: { communitySlug: 's' }, userId: 'me', isAdmin: false })).status,
    ).toBe(200);

    h.member.findUnique.mockResolvedValue(null);
    h.page.findUnique.mockResolvedValue({ communityId: 'c1', community: { isPrivate: true } });
    const REV = await routeHandlers('@/app/routes/api/community-pages/$id.revisions', 'GET');
    expect((await REV({ params: { id: 'p1' }, userId: 'stranger' })).status).toBe(404);
  });
});

describe('locked community payload', () => {
  it('is built from an allow-list: no owner id, verification, starboard or flair settings', async () => {
    const c = await getCommunity('s', 'stranger');
    expect(Object.keys(c!).sort()).toEqual(
      [
        'id', 'slug', 'name', 'description', 'icon', 'color', 'isPrivate', 'memberCount', 'createdById',
        'createdAt', 'postCount', 'joined', 'role', 'announcements', 'locked', 'requestState',
        'flairRequired', 'starThreshold', 'verificationLevel', 'verificationValue',
      ].sort(),
    );
    expect(c).toMatchObject({
      createdById: '',
      flairRequired: false,
      starThreshold: 0,
      verificationLevel: 'none',
      verificationValue: 0,
    });
  });
});

describe('events of a private community are members-only', () => {
  const EVENT_ROW = {
    id: 'e1',
    hostId: 'owner',
    communityId: 'c1',
    title: 'Secret meetup',
    description: 'd',
    startsAt: new Date(Date.now() + 3600_000),
    endsAt: null,
    venueKind: 'IRL',
    venueRef: 'Somewhere',
    capacity: null,
    canceledAt: null,
    createdAt: new Date(),
    recurrence: null,
    host: { id: 'owner', name: 'O', handle: 'o', image: null },
    community: { id: 'c1', slug: 's', name: 'N', icon: null, color: null, isPrivate: true },
    canceled: null,
  };
  const privateCommunity = (isMember: boolean) =>
    h.community.findUnique.mockResolvedValue({ isPrivate: true, members: isMember ? [{ id: 'm' }] : [] });

  beforeEach(() => {
    h.event.findUnique.mockResolvedValue(EVENT_ROW);
    h.event.findMany.mockResolvedValue([EVENT_ROW]);
    h.rsvp.groupBy.mockResolvedValue([]);
    h.rsvp.findMany.mockResolvedValue([]);
  });

  it('listEvents(scope=community): empty for an anonymous viewer and a non-member, no event query made', async () => {
    privateCommunity(false);
    expect(await listEvents({ scope: 'community', communityId: 'c1', userId: null })).toEqual([]);
    expect(await listEvents({ scope: 'community', communityId: 'c1', userId: 'stranger' })).toEqual([]);
    expect(h.event.findMany).not.toHaveBeenCalled();
    privateCommunity(true);
    expect(await listEvents({ scope: 'community', communityId: 'c1', userId: 'me' })).toHaveLength(1);
  });

  it('listEvents(scope=community) is unchanged for a public community', async () => {
    h.community.findUnique.mockResolvedValue({ isPrivate: false, members: false });
    expect(await listEvents({ scope: 'community', communityId: 'c9', userId: null })).toHaveLength(1);
  });

  it('getEvent (and GET /api/events/:id): null / 404 for a non-member, the event for a member', async () => {
    privateCommunity(false);
    expect(await getEvent('e1', null)).toBeNull();
    expect(await getEvent('e1', 'stranger')).toBeNull();
    const GET = await routeHandlers('@/app/routes/api/events/$id/index', 'GET');
    expect((await GET({ params: { id: 'e1' }, session: null })).status).toBe(404);
    privateCommunity(true);
    expect((await GET({ params: { id: 'e1' }, ...session('me') })).status).toBe(200);
  });

  it('GET /api/events?scope=community: no event data for an anonymous viewer', async () => {
    privateCommunity(false);
    const GET = await routeHandlers('@/app/routes/api/events/index', 'GET');
    const res = await GET({
      request: new Request('http://x/api/events?scope=community&communityId=c1'),
      session: null,
    });
    expect(await res.json()).toEqual({ events: [] });
  });

  it('the .ics download: 404 for a non-member (never shared-cached), file for a member', async () => {
    h.event.findUnique.mockResolvedValue({ ...EVENT_ROW, community: { name: 'N', isPrivate: true } });
    const GET = await routeHandlers('@/app/routes/api/events/$id/ics', 'GET');
    const req = new Request('http://x/api/events/e1/ics');
    privateCommunity(false);
    h.getSession.mockResolvedValue(null);
    expect((await GET({ params: { id: 'e1' }, request: req })).status).toBe(404);
    h.getSession.mockResolvedValue({ user: { id: 'stranger' } });
    expect((await GET({ params: { id: 'e1' }, request: req })).status).toBe(404);
    privateCommunity(true);
    h.getSession.mockResolvedValue({ user: { id: 'me' } });
    const ok = await GET({ params: { id: 'e1' }, request: req });
    expect(ok.status).toBe(200);
    expect(ok.headers.get('Cache-Control')).toBe('private, no-store');
  });

  it('RSVP: a non-member gets NOT_FOUND and nothing is written', async () => {
    privateCommunity(false);
    await expect(rsvp('e1', 'stranger', 'going')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(h.transaction).not.toHaveBeenCalled();
  });
});
