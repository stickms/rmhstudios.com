/**
 * s09-04: the wiki's endpoints keep their paths and limits, an edit based on an older version is refused (409) and
 * rolled back whole, a rollback is a revision of its own, and the moderator actions land in the community mod log.
 * Prisma is an in-memory fake with transactions that undo their writes when the callback throws.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

interface PageRow {
  id: string;
  communityId: string;
  slug: string;
  title: string;
  body: string;
  editPolicy: string;
  pinned: boolean;
  createdAt: Date;
  updatedAt: Date;
}
interface RevisionRow {
  id: bigint;
  pageId: string;
  editorId: string;
  body: string;
  summary: string | null;
  createdAt: Date;
}

const h = vi.hoisted(() => ({
  pages: [] as PageRow[],
  revisions: [] as RevisionRow[],
  logged: [] as Array<{ action: string; actorId: string; targetId?: string | null; detail?: unknown }>,
  roles: {} as Record<string, string>,
  clock: 1_000_000,
  nextRevision: 1n,
  nextPage: 1,
  captured: [] as Array<{ label: string; options: Record<string, unknown> }>,
}));

const { fakeTx } = vi.hoisted(() => {
  const tick = () => new Date((h.clock += 1000));

  const fakeTx = {
    communityPage: {
      findUnique: async ({
        where,
      }: {
        where: { id?: string; communityId_slug?: { communityId: string; slug: string } };
      }) => {
        const row = h.pages.find((p) =>
          where.id
            ? p.id === where.id
            : p.communityId === where.communityId_slug?.communityId && p.slug === where.communityId_slug?.slug,
        );
        // A copy, as a database hands back: later writes must not change what a caller already read.
        return row ? { ...row } : null;
      },
      findUniqueOrThrow: async ({ where }: { where: { id: string } }) => {
        const row = h.pages.find((p) => p.id === where.id);
        if (!row) throw new Error('not found');
        return { ...row };
      },
      create: async ({ data }: { data: Omit<PageRow, 'id' | 'createdAt' | 'updatedAt'> }) => {
        const row: PageRow = { ...data, id: `p${h.nextPage++}`, createdAt: tick(), updatedAt: tick() };
        h.pages.push(row);
        return { ...row };
      },
      updateMany: async ({ where, data }: { where: { id: string; updatedAt: Date }; data: Partial<PageRow> }) => {
        const row = h.pages.find((p) => p.id === where.id && p.updatedAt.getTime() === where.updatedAt.getTime());
        if (!row) return { count: 0 };
        Object.assign(row, data, { updatedAt: tick() });
        return { count: 1 };
      },
      delete: async ({ where }: { where: { id: string } }) => {
        h.pages = h.pages.filter((p) => p.id !== where.id);
        h.revisions = h.revisions.filter((r) => r.pageId !== where.id);
      },
    },
    communityPageRevision: {
      create: async ({ data }: { data: Omit<RevisionRow, 'id' | 'createdAt'> }) => {
        const row: RevisionRow = { ...data, id: h.nextRevision++, createdAt: tick() };
        h.revisions.push(row);
        return row;
      },
      findUnique: async ({ where }: { where: { id: bigint } }) => h.revisions.find((r) => r.id === where.id) ?? null,
    },
  };

  return { fakeTx };
});

vi.mock('@/lib/prisma.server', () => ({
  prisma: {
    ...fakeTx,
    community: { findUnique: async () => ({ id: 'c1', isPrivate: false }) },
    communityMember: {
      findUnique: async ({ where }: { where: { communityId_userId: { userId: string } } }) => {
        const role = h.roles[where.communityId_userId.userId];
        return role ? { role, joinedAt: new Date(0) } : null;
      },
    },
    userStrike: { count: async () => 0 },
    user: { findUnique: async () => ({ bannedUntil: null }) },
    $transaction: async (fn: (tx: typeof fakeTx) => Promise<unknown>) => {
      const pages = h.pages.map((p) => ({ ...p }));
      const revisions = [...h.revisions];
      const logged = [...h.logged];
      try {
        return await fn(fakeTx);
      } catch (error) {
        h.pages = pages;
        h.revisions = revisions;
        h.logged = logged;
        throw error;
      }
    },
  },
}));
vi.mock('@/lib/communities/bans.server', () => ({ activeSanction: async () => null }));
vi.mock('@/lib/communities/modlog.server', () => ({
  logModAction: async (
    _tx: unknown,
    input: { action: string; actorId: string; targetId?: string | null; detail?: unknown },
  ) => {
    h.logged.push(input);
    return 1n;
  },
}));
vi.mock('@/lib/user-display', () => ({ userDisplaySelect: {}, resolveUser: (u: unknown) => u }));
vi.mock('@/lib/api/handler.server', () => ({
  defineHandler: (options: Record<string, unknown> & { label: string }, fn: (c: unknown) => unknown) => {
    h.captured.push({ label: options.label, options });
    return fn;
  },
}));

import {
  CommunityPageError,
  createCommunityPage,
  deleteCommunityPage,
  rollbackCommunityPage,
  updateCommunityPage,
} from '@/lib/communities/pages.server';
import { route as listRoute } from '@/lib/communities/api/community-pages.server';
import { route as pageRoute } from '@/lib/communities/api/community-pages.$id.server';
import { route as revisionsRoute } from '@/lib/communities/api/community-pages.$id.revisions.server';

type Handler = (ctx: Record<string, unknown>) => Promise<Response>;
const handlers = (route: unknown) => (route as { handlers: Record<string, Handler> }).handlers;

beforeEach(() => {
  h.pages = [];
  h.revisions = [];
  h.logged = [];
  h.roles = { mod: 'MOD', member: 'MEMBER' };
  h.nextRevision = 1n;
  h.nextPage = 1;
});

describe('the wiki endpoints', () => {
  it('keep their paths, methods, auth and rate limits on implement()', () => {
    expect(listRoute.path).toBe('/api/community-pages');
    expect(pageRoute.path).toBe('/api/community-pages/$id');
    expect(revisionsRoute.path).toBe('/api/community-pages/$id/revisions');
    const by = Object.fromEntries(h.captured.map((c) => [c.label, c.options]));
    const perUser = (limit: number) => ({ limit, windowMs: 3_600_000, prefix: 'community-page', scope: 'user' });
    expect(by['GET /api/community-pages']).toMatchObject({ auth: 'optional', rateLimit: 'read' });
    expect(by['POST /api/community-pages']).toMatchObject({ rateLimit: perUser(20) });
    expect(by['PATCH /api/community-pages/$id']).toMatchObject({ rateLimit: perUser(40) });
    expect(by['DELETE /api/community-pages/$id']).toMatchObject({ rateLimit: 'write' });
    expect(by['GET /api/community-pages/$id/revisions']).toMatchObject({ auth: 'optional', rateLimit: 'read' });
    expect(by['POST /api/community-pages/$id/revisions']).toMatchObject({ rateLimit: perUser(20) });
  });
});

describe('creating, editing and restoring', () => {
  it('a moderator creates a page, a member edits it with a summary, a restore adds a revision of its own', async () => {
    const created = await createCommunityPage('mod', 'c1', { title: 'FAQ', body: 'First text', editPolicy: 'members' });
    expect(created).toMatchObject({ slug: 'faq', editPolicy: 'members' });
    expect(h.logged.map((l) => l.action)).toEqual(['wiki_page_created']);

    const edited = await updateCommunityPage('member', created.id, {
      body: 'Second text',
      summary: 'Tidied up',
      baseUpdatedAt: created.updatedAt,
    });
    expect(edited.body).toBe('Second text');
    // The revision is the text BEFORE the edit, with the editor's id and summary; an ordinary edit is not in the mod log.
    expect(h.revisions).toEqual([
      expect.objectContaining({ editorId: 'member', body: 'First text', summary: 'Tidied up' }),
    ]);
    expect(h.logged).toHaveLength(1);

    const restored = await rollbackCommunityPage('mod', created.id, '1', edited.updatedAt);
    expect(restored.body).toBe('First text');
    // The rollback is itself a revision (the text it replaced), and a mod-log row.
    expect(h.revisions).toHaveLength(2);
    expect(h.revisions[1]).toMatchObject({ editorId: 'mod', body: 'Second text' });
    expect(h.logged.at(-1)).toMatchObject({ action: 'wiki_page_rolled_back', actorId: 'mod', detail: { slug: 'faq' } });
  });

  it('refuses an edit based on an older version with a 409 and rolls the revision back too', async () => {
    const created = await createCommunityPage('mod', 'c1', { title: 'FAQ', body: 'One', editPolicy: 'members' });
    await updateCommunityPage('member', created.id, { body: 'Two', baseUpdatedAt: created.updatedAt });
    const before = { pages: structuredClone(h.pages), revisions: h.revisions.length, logged: h.logged.length };

    const stale = updateCommunityPage('mod', created.id, { body: 'Three', baseUpdatedAt: created.updatedAt });
    await expect(stale).rejects.toMatchObject({ code: 'CONFLICT' });
    await expect(stale).rejects.toBeInstanceOf(CommunityPageError);
    expect(h.pages).toEqual(before.pages);
    expect(h.revisions).toHaveLength(before.revisions);
    expect(h.logged).toHaveLength(before.logged);

    // A rollback takes the same check.
    await expect(rollbackCommunityPage('mod', created.id, '1', created.updatedAt)).rejects.toMatchObject({
      code: 'CONFLICT',
    });
    expect(h.revisions).toHaveLength(before.revisions);
  });

  it('answers a stale edit with the 409 text through the endpoint', async () => {
    const created = await createCommunityPage('mod', 'c1', { title: 'FAQ', body: 'One', editPolicy: 'members' });
    await updateCommunityPage('member', created.id, { body: 'Two', baseUpdatedAt: created.updatedAt });
    const res = await handlers(pageRoute).PATCH!({
      params: { id: created.id },
      userId: 'mod',
      isAdmin: false,
      body: { body: 'Three', baseUpdatedAt: created.updatedAt },
    });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'Someone else edited this page; reload to see their changes' });
  });
});

describe('the moderator log', () => {
  it('records a policy or pin change, once, and nothing when nothing changed', async () => {
    const created = await createCommunityPage('mod', 'c1', { title: 'Rules', body: 'Be kind' });
    let page = await updateCommunityPage('mod', created.id, {
      editPolicy: 'trusted',
      baseUpdatedAt: created.updatedAt,
    });
    expect(h.logged.at(-1)).toMatchObject({
      action: 'wiki_policy_changed',
      targetId: created.id,
      detail: { slug: 'rules', editPolicy: 'trusted', pinned: false },
    });
    const count = h.logged.length;
    page = await updateCommunityPage('mod', created.id, { editPolicy: 'trusted', baseUpdatedAt: page.updatedAt });
    expect(h.logged).toHaveLength(count);
    await updateCommunityPage('mod', created.id, { pinned: true, baseUpdatedAt: page.updatedAt });
    expect(h.logged.at(-1)).toMatchObject({ action: 'wiki_policy_changed', detail: { pinned: true } });
  });

  it('records a delete, and only a moderator can delete or change settings', async () => {
    const created = await createCommunityPage('mod', 'c1', { title: 'Old', body: 'x', editPolicy: 'members' });
    await expect(deleteCommunityPage('member', created.id)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      updateCommunityPage('member', created.id, { pinned: true, baseUpdatedAt: created.updatedAt }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await deleteCommunityPage('mod', created.id);
    expect(h.pages).toHaveLength(0);
    expect(h.logged.map((l) => l.action)).toEqual(['wiki_page_created', 'wiki_page_deleted']);
    expect(h.logged.at(-1)).toMatchObject({ detail: { slug: 'old' } });
  });

  it('only a moderator creates a page', async () => {
    await expect(createCommunityPage('member', 'c1', { title: 'Mine', body: 'x' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    expect(h.logged).toHaveLength(0);
  });
});
