/**
 * s09-04: one helper (`pageAccess`) decides every wiki path. A private community's pages are a 404 for anyone who is
 * not a member (list, page, history and every write), a member banned from the community reads like a non-member of a
 * private one and cannot write, a timed-out member reads and cannot write, a site ban refuses writes.
 */
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  isPrivate: true,
  role: null as string | null,
  sanction: null as null | { kind: 'ban' | 'timeout'; endsAt: Date | null },
  bannedUntil: null as Date | null,
  page: {
    findUnique: vi.fn(),
    findUniqueOrThrow: vi.fn(),
    findMany: vi.fn(),
    updateMany: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
  },
  revision: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn() },
}));

vi.mock('@/lib/prisma.server', () => ({
  prisma: {
    community: {
      findUnique: async ({ where }: { where: { id?: string; slug?: string } }) =>
        where.id === 'gone' ? null : { id: 'c1', slug: 'club', name: 'Club', icon: null, isPrivate: h.isPrivate },
    },
    communityMember: {
      findUnique: async () => (h.role ? { role: h.role, joinedAt: new Date('2026-01-01T00:00:00Z') } : null),
    },
    userStrike: { count: async () => 0 },
    user: { findUnique: async () => ({ bannedUntil: h.bannedUntil }) },
    communityPage: h.page,
    communityPageRevision: h.revision,
    $transaction: async (fn: (tx: unknown) => unknown) =>
      fn({ communityPage: h.page, communityPageRevision: h.revision }),
  },
}));
vi.mock('@/lib/communities/bans.server', () => ({ activeSanction: async () => h.sanction }));
vi.mock('@/lib/communities/modlog.server', () => ({ logModAction: async () => 1n }));
vi.mock('@/lib/user-display', () => ({ userDisplaySelect: {}, resolveUser: (u: unknown) => u }));
vi.mock('@/lib/api/handler.server', () => ({
  defineHandler: (_options: unknown, fn: (c: unknown) => unknown) => fn,
}));

import { pageAccess, resolveWikiCommunity } from '@/lib/communities/page-access.server';
import { getCommunityPage, listCommunityPages, listRevisions } from '@/lib/communities/pages.server';
import { route as listRoute } from '@/lib/communities/api/community-pages.server';
import { route as pageRoute } from '@/lib/communities/api/community-pages.$id.server';
import { route as revisionsRoute } from '@/lib/communities/api/community-pages.$id.revisions.server';
import { BAN_ENFORCEMENT_PATHS } from '@/lib/communities/bans';

type Handler = (ctx: Record<string, unknown>) => Promise<Response>;
const handlers = (route: unknown) => (route as { handlers: Record<string, Handler> }).handlers;

const PAGE_ROW = {
  id: 'p1',
  communityId: 'c1',
  slug: 'faq',
  title: 'FAQ',
  body: 'Text',
  editPolicy: 'members',
  pinned: false,
  createdAt: new Date('2026-02-01T00:00:00Z'),
  updatedAt: new Date('2026-03-01T00:00:00Z'),
};
const BASE = PAGE_ROW.updatedAt.toISOString();
const ME = { userId: 'me', isAdmin: false };

beforeEach(() => {
  h.isPrivate = true;
  h.role = null;
  h.sanction = null;
  h.bannedUntil = null;
  for (const model of [h.page, h.revision]) for (const fn of Object.values(model)) fn.mockReset();
  h.page.findUnique.mockImplementation(async () => ({ ...PAGE_ROW }));
  h.page.findMany.mockResolvedValue([]);
  h.page.findUniqueOrThrow.mockImplementation(async () => ({ ...PAGE_ROW }));
  h.page.updateMany.mockResolvedValue({ count: 1 });
  h.page.create.mockResolvedValue({ ...PAGE_ROW });
  h.revision.findMany.mockResolvedValue([]);
  h.revision.findUnique.mockResolvedValue({ id: 1n, pageId: 'p1', body: 'Older' });
});

describe('pageAccess', () => {
  it('lets a member of a private community read and write', async () => {
    h.role = 'MEMBER';
    expect(await pageAccess('c1', 'me')).toMatchObject({ read: true, writeRefusal: null, role: 'MEMBER' });
  });

  it('refuses a non-member and a signed-out viewer a private community, and lets a site admin in', async () => {
    expect(await pageAccess('c1', 'me')).toMatchObject({ read: false });
    expect(await pageAccess('c1', null)).toMatchObject({ read: false, writeRefusal: { reason: 'SIGNED_OUT' } });
    expect(await pageAccess('c1', 'admin', true)).toMatchObject({ read: true });
    h.isPrivate = false;
    expect(await pageAccess('c1', null)).toMatchObject({ read: true, writeRefusal: { reason: 'SIGNED_OUT' } });
  });

  it('is null for a community that does not exist', async () => {
    expect(await pageAccess('gone', 'me')).toBeNull();
  });

  it('a member banned from the community reads like a non-member of a private one, and cannot write', async () => {
    h.role = 'MEMBER';
    h.sanction = { kind: 'ban', endsAt: null };
    expect(await pageAccess('c1', 'me')).toMatchObject({
      read: false,
      writeRefusal: { reason: 'COMMUNITY_BANNED' },
    });
    h.isPrivate = false;
    expect(await pageAccess('c1', 'me')).toMatchObject({ read: true, writeRefusal: { reason: 'COMMUNITY_BANNED' } });
  });

  it('a timed-out member reads and cannot write', async () => {
    h.role = 'MEMBER';
    const endsAt = new Date(Date.now() + 3_600_000);
    h.sanction = { kind: 'timeout', endsAt };
    expect(await pageAccess('c1', 'me')).toMatchObject({ read: true, writeRefusal: { reason: 'TIMED_OUT', endsAt } });
  });

  it('a site ban refuses writes, an expired one does not', async () => {
    h.role = 'MEMBER';
    h.bannedUntil = new Date(Date.now() + 86_400_000);
    expect(await pageAccess('c1', 'me')).toMatchObject({ read: true, writeRefusal: { reason: 'SITE_BANNED' } });
    h.bannedUntil = new Date(Date.now() - 1000);
    expect((await pageAccess('c1', 'me'))?.writeRefusal).toBeNull();
  });

  it('resolveWikiCommunity answers the same null for a missing community and a private one', async () => {
    expect(await resolveWikiCommunity({ id: 'gone' }, 'me')).toBeNull();
    expect(await resolveWikiCommunity({ slug: 'club' }, 'me')).toBeNull();
    h.role = 'MEMBER';
    expect(await resolveWikiCommunity({ slug: 'club' }, 'me')).toMatchObject({ community: { slug: 'club' } });
  });
});

describe('the reads take the access they were given', () => {
  it('return nothing for a viewer who may not read', async () => {
    const access = (await pageAccess('c1', 'me'))!;
    expect(await listCommunityPages(access)).toEqual([]);
    expect(await getCommunityPage(access, 'faq', 'me')).toBeNull();
    expect(await listRevisions('p1', access)).toBeNull();
    expect(h.page.findMany).not.toHaveBeenCalled();
    expect(h.revision.findMany).not.toHaveBeenCalled();
  });

  it('a page read says why a timed-out member cannot edit, and until when', async () => {
    h.role = 'MEMBER';
    const endsAt = new Date(Date.now() + 3_600_000);
    h.sanction = { kind: 'timeout', endsAt };
    const access = (await pageAccess('c1', 'me'))!;
    expect(await getCommunityPage(access, 'faq', 'me')).toMatchObject({
      canEdit: false,
      refusal: 'TIMED_OUT',
      refusalEndsAt: endsAt.toISOString(),
    });
    h.sanction = null;
    expect(await getCommunityPage((await pageAccess('c1', 'me'))!, 'faq', 'me')).toMatchObject({
      canEdit: true,
      refusal: null,
    });
  });

  it('a history for a page of another community is not found', async () => {
    h.role = 'MEMBER';
    h.page.findUnique.mockResolvedValue({ communityId: 'other' });
    expect(await listRevisions('p1', (await pageAccess('c1', 'me'))!)).toBeNull();
  });
});

describe('every endpoint path applies it', () => {
  const body = { revisionId: '1', baseUpdatedAt: BASE };

  it('a non-member of a private community gets 404 on the list, the page, the history and every write', async () => {
    const calls: Array<[string, Promise<Response>]> = [
      ['list', handlers(listRoute).GET!({ query: { communitySlug: 'club' }, ...ME })],
      ['page', handlers(listRoute).GET!({ query: { communitySlug: 'club', slug: 'faq' }, ...ME })],
      ['history', handlers(revisionsRoute).GET!({ params: { id: 'p1' }, ...ME })],
      ['create', handlers(listRoute).POST!({ body: { communityId: 'c1', title: 'New', body: 'x' }, ...ME })],
      ['edit', handlers(pageRoute).PATCH!({ params: { id: 'p1' }, body: { body: 'x', baseUpdatedAt: BASE }, ...ME })],
      ['rollback', handlers(revisionsRoute).POST!({ params: { id: 'p1' }, body, ...ME })],
      ['delete', handlers(pageRoute).DELETE!({ params: { id: 'p1' }, ...ME })],
    ];
    for (const [name, call] of calls) expect((await call).status, name).toBe(404);
    expect(h.page.updateMany).not.toHaveBeenCalled();
    expect(h.page.create).not.toHaveBeenCalled();
    expect(h.page.delete).not.toHaveBeenCalled();
  });

  it('a member banned from a public community reads, and every write is a 403 with the ban code', async () => {
    h.isPrivate = false;
    h.role = 'MOD';
    h.sanction = { kind: 'ban', endsAt: null };
    expect((await handlers(listRoute).GET!({ query: { communitySlug: 'club' }, ...ME })).status).toBe(200);
    const writes: Array<[string, Promise<Response>]> = [
      ['create', handlers(listRoute).POST!({ body: { communityId: 'c1', title: 'New', body: 'x' }, ...ME })],
      ['edit', handlers(pageRoute).PATCH!({ params: { id: 'p1' }, body: { body: 'x', baseUpdatedAt: BASE }, ...ME })],
      ['rollback', handlers(revisionsRoute).POST!({ params: { id: 'p1' }, body, ...ME })],
      ['delete', handlers(pageRoute).DELETE!({ params: { id: 'p1' }, ...ME })],
    ];
    for (const [name, call] of writes) {
      const res = await call;
      expect(res.status, name).toBe(403);
      expect(await res.json(), name).toMatchObject({ code: 'community_banned', endsAt: null });
    }
    expect(h.page.updateMany).not.toHaveBeenCalled();
  });

  it('a timed-out member reads the page and the history, and cannot edit until it ends', async () => {
    h.isPrivate = false;
    h.role = 'MEMBER';
    const endsAt = new Date(Date.now() + 3_600_000);
    h.sanction = { kind: 'timeout', endsAt };
    expect((await handlers(listRoute).GET!({ query: { communitySlug: 'club', slug: 'faq' }, ...ME })).status).toBe(200);
    expect((await handlers(revisionsRoute).GET!({ params: { id: 'p1' }, ...ME })).status).toBe(200);
    const res = await handlers(pageRoute).PATCH!({
      params: { id: 'p1' },
      body: { body: 'x', baseUpdatedAt: BASE },
      ...ME,
    });
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: 'community_timed_out', endsAt: endsAt.toISOString() });
    expect(h.page.updateMany).not.toHaveBeenCalled();
  });

  it('a site ban refuses the write with a 403', async () => {
    h.isPrivate = false;
    h.role = 'MEMBER';
    h.bannedUntil = new Date(Date.now() + 86_400_000);
    const res = await handlers(pageRoute).PATCH!({
      params: { id: 'p1' },
      body: { body: 'x', baseUpdatedAt: BASE },
      ...ME,
    });
    expect(res.status).toBe(403);
    expect(h.page.updateMany).not.toHaveBeenCalled();
  });

  it('an allowed member edits', async () => {
    h.isPrivate = false;
    h.role = 'MEMBER';
    const res = await handlers(pageRoute).PATCH!({
      params: { id: 'p1' },
      body: { body: 'x', baseUpdatedAt: BASE },
      ...ME,
    });
    expect(res.status).toBe(200);
    expect(h.page.updateMany).toHaveBeenCalledTimes(1);
  });
});

describe('the ban-enforcement registry', () => {
  it('lists the helper, which reads activeSanction', () => {
    expect(BAN_ENFORCEMENT_PATHS).toContain('lib/communities/page-access.server.ts');
    expect(readFileSync('lib/communities/page-access.server.ts', 'utf8')).toMatch(/activeSanction\(/);
  });
});
