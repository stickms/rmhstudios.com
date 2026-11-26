import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { assertJsonSafe } from '@/lib/db/query-shape';
import { handlersOfModule } from '@/lib/__tests__/api-handlers-of';
import {
  MEMBER_ITEM_REPORT_TYPES,
  REMOVABLE_REPORT_ENTITY_TYPES,
  REPORT_ENTITY_TYPES,
} from '@/lib/moderation/report-constants';
import { MEMBER_TEXT_REPORT_TYPES } from '@/lib/moderation/member-text-reports.server';

/**
 * s15-06: a guestbook entry and an announcement comment go through the report flow as `guestbook-entry` and
 * `blog-comment`. Each resolves its author, is refused for the author's own text, for text a reporter cannot read
 * (a closed guestbook, a block either way, an author they muted, an unpublished or ordinary post, a banned
 * commenter), for text already hidden or deleted; the takedown deletes an entry and soft-deletes a comment. The route
 * and the takedown run against a small in-memory database wrapped in `shapeChecked`.
 */

type Row = Record<string, unknown>;
const h = vi.hoisted(() => ({
  entries: [] as Row[],
  comments: [] as Row[],
  posts: [] as Row[],
  profiles: [] as Row[],
  reports: [] as Row[],
  hidden: [] as string[],
  blocked: [] as string[],
}));

const matches = (row: Row, where: Row): boolean =>
  Object.entries(where).every(([k, v]) => {
    // Relation filters (the commenter is not banned, the post is a published announcement) are exercised below by
    // `memberTextReadableBy`, which reads them as plain columns.
    if (k === 'user' || k === 'post') return true;
    if (v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date)) {
      const op = v as Row;
      if ('in' in op) return (op.in as unknown[]).includes(row[k]);
      if ('notIn' in op) return !(op.notIn as unknown[]).includes(row[k]);
    }
    return row[k] === v;
  });
const user = (id: string) => ({
  id,
  name: `Name ${id}`,
  username: null,
  handle: id,
  image: null,
  profile: null,
  inventory: [],
});
const find =
  (rows: () => Row[]) =>
  async ({ where }: { where: Row }) =>
    rows().find((r) => matches(r, where)) ?? null;

vi.mock('@/lib/prisma.server', async () => {
  const { shapeChecked } = await import('@/lib/db/query-shape');
  return {
    prisma: shapeChecked({
      guestbookEntry: {
        findUnique: vi.fn((a: { where: Row }) => find(() => h.entries)(a)),
        findMany: vi.fn(async ({ where }: { where: Row }) =>
          h.entries
            .filter((r) => matches(r, where))
            .map((r) => ({ ...r, author: user(String(r.authorId)), owner: user(String(r.ownerId)) })),
        ),
        deleteMany: vi.fn(async ({ where }: { where: Row }) => {
          const hit = h.entries.filter((r) => matches(r, where));
          h.entries = h.entries.filter((r) => !hit.includes(r));
          return { count: hit.length };
        }),
      },
      blogComment: {
        findUnique: vi.fn(async (a: { where: Row }) => {
          const row = await find(() => h.comments)(a);
          // The select carries the commenter's account ban; the fake keeps it on the row as `bannedUntil`.
          return row && { ...row, user: { bannedUntil: row.bannedUntil ?? null } };
        }),
        findMany: vi.fn(async ({ where }: { where: Row }) =>
          h.comments
            .filter((r) => matches(r, where))
            .map((r) => ({ ...r, user: user(String(r.userId)), post: { title: 'Big news', slug: 'big-news' } })),
        ),
        updateMany: vi.fn(async ({ where, data }: { where: Row; data: Row }) => {
          const hit = h.comments.filter((r) => matches(r, where));
          for (const r of hit) Object.assign(r, data);
          return { count: hit.length };
        }),
      },
      blogPost: {
        findFirst: vi.fn(async ({ where }: { where: Row }) => h.posts.find((p) => p.id === where.id) ?? null),
      },
      userProfile: {
        findUnique: vi.fn(
          async ({ where }: { where: Row }) => h.profiles.find((p) => p.userId === where.userId) ?? null,
        ),
      },
      contentReport: {
        findFirst: vi.fn(async () => null),
        create: vi.fn(async ({ data }: { data: Row }) => {
          h.reports.push(data);
          return data;
        }),
      },
    }),
  };
});
vi.mock('@/lib/moderation.server', () => ({
  getHiddenAuthorIds: vi.fn(async () => h.hidden),
  getBlockedAuthorIds: vi.fn(async () => h.blocked),
}));
vi.mock('@/lib/api/handler.server', () => ({ defineHandler: (_o: unknown, fn: unknown) => fn }));
vi.mock('@/lib/admin-review.server', () => ({ notifyAdminsOfReview: vi.fn(async () => {}) }));
vi.mock('@/lib/rmhmusic/learn/moderation.server', () => ({ musicReportOwner: vi.fn(), hideMusicContent: vi.fn() }));
vi.mock('@/lib/cached.server', () => ({ cached: vi.fn(), invalidateCached: vi.fn(async () => {}) }));

type Handler = (a: { session: { user: { id: string } }; body: Record<string, unknown> }) => Promise<Response>;

async function report(reporter: string, entityType: string, entityId: string) {
  const mod = await import('@/lib/moderation/api/moderation.report.server');
  const post = handlersOfModule<Handler>(mod).POST!;
  return post({ session: { user: { id: reporter } }, body: { entityType, entityId, reason: 'SPAM' } });
}

const NOW = new Date('2027-01-05T10:00:00Z');

beforeEach(() => {
  h.entries = [
    { id: 'g1', ownerId: 'owner', authorId: 'writer', body: 'Hello there', hiddenAt: null },
    { id: 'g2', ownerId: 'owner', authorId: 'writer', body: 'Hidden one', hiddenAt: new Date('2027-01-01T00:00:00Z') },
    { id: 'g3', ownerId: 'closed-owner', authorId: 'writer', body: 'In a closed book', hiddenAt: null },
  ];
  h.comments = [
    { id: 'c1', postId: 'p1', userId: 'writer', content: 'A comment', deletedAt: null },
    { id: 'c2', postId: 'p1', userId: 'writer', content: 'Gone', deletedAt: new Date('2027-01-01T00:00:00Z') },
    { id: 'c3', postId: 'p-ordinary', userId: 'writer', content: 'Not an announcement', deletedAt: null },
  ];
  h.posts = [{ id: 'p1' }];
  h.profiles = [
    { userId: 'owner', guestbookMode: 'everyone' },
    { userId: 'closed-owner', guestbookMode: 'off' },
  ];
  h.reports = [];
  h.hidden = [];
  h.blocked = [];
});

describe('the two types', () => {
  it('are reportable, removable and held to the member-item rule', () => {
    expect([...MEMBER_TEXT_REPORT_TYPES].sort()).toEqual(['blog-comment', 'guestbook-entry']);
    for (const type of MEMBER_TEXT_REPORT_TYPES) {
      expect(REPORT_ENTITY_TYPES).toContain(type);
      expect(REMOVABLE_REPORT_ENTITY_TYPES).toContain(type);
      expect(MEMBER_ITEM_REPORT_TYPES.has(type)).toBe(true);
    }
  });
});

describe('filing a report on a guestbook entry', () => {
  it('resolves the member who wrote it', async () => {
    const res = await report('visitor', 'guestbook-entry', 'g1');
    expect(res.status).toBe(200);
    expect(h.reports).toEqual([
      expect.objectContaining({ entityType: 'guestbook-entry', entityId: 'g1', targetUserId: 'writer' }),
    ]);
  });

  it("lets the guestbook's owner report an entry in their own guestbook", async () => {
    expect((await report('owner', 'guestbook-entry', 'g1')).status).toBe(200);
    expect(h.reports).toHaveLength(1);
  });

  it('refuses the entry author reporting their own entry (403)', async () => {
    expect((await report('writer', 'guestbook-entry', 'g1')).status).toBe(403);
    expect(h.reports).toHaveLength(0);
  });

  it('refuses a missing entry and an entry the owner hid (404)', async () => {
    expect((await report('visitor', 'guestbook-entry', 'nope')).status).toBe(404);
    expect((await report('visitor', 'guestbook-entry', 'g2')).status).toBe(404);
    expect((await report('owner', 'guestbook-entry', 'g2')).status).toBe(404);
    expect(h.reports).toHaveLength(0);
  });

  it('refuses an entry in a closed guestbook to a visitor, but not to its owner', async () => {
    expect((await report('visitor', 'guestbook-entry', 'g3')).status).toBe(404);
    expect((await report('closed-owner', 'guestbook-entry', 'g3')).status).toBe(200);
  });

  it('refuses a reporter who is blocked by (or blocked) the guestbook owner', async () => {
    h.blocked = ['owner'];
    h.hidden = ['owner'];
    expect((await report('visitor', 'guestbook-entry', 'g1')).status).toBe(404);
    expect(h.reports).toHaveLength(0);
  });

  it('refuses an entry whose author the reporter blocked or muted', async () => {
    h.hidden = ['writer'];
    expect((await report('visitor', 'guestbook-entry', 'g1')).status).toBe(404);
    expect(h.reports).toHaveLength(0);
  });
});

describe('filing a report on an announcement comment', () => {
  it('resolves the member who wrote it', async () => {
    const res = await report('reader', 'blog-comment', 'c1');
    expect(res.status).toBe(200);
    expect(h.reports).toEqual([
      expect.objectContaining({ entityType: 'blog-comment', entityId: 'c1', targetUserId: 'writer' }),
    ]);
  });

  it('refuses its own author (403), a missing and a deleted comment (404)', async () => {
    expect((await report('writer', 'blog-comment', 'c1')).status).toBe(403);
    expect((await report('reader', 'blog-comment', 'nope')).status).toBe(404);
    expect((await report('reader', 'blog-comment', 'c2')).status).toBe(404);
    expect(h.reports).toHaveLength(0);
  });

  it('refuses a comment on a post that is not a published announcement', async () => {
    expect((await report('reader', 'blog-comment', 'c3')).status).toBe(404);
    expect(h.reports).toHaveLength(0);
  });

  it('refuses a comment by someone the reporter blocked or muted', async () => {
    h.hidden = ['writer'];
    expect((await report('reader', 'blog-comment', 'c1')).status).toBe(404);
    expect(h.reports).toHaveLength(0);
  });

  it('refuses a comment by a banned commenter, and reads it again once the ban has ended', async () => {
    h.comments[0]!.bannedUntil = new Date(NOW.getTime() + 86_400_000);
    const { memberTextReadableBy } = await import('@/lib/moderation/member-text-reports.server');
    expect(await memberTextReadableBy('blog-comment', 'c1', 'reader', NOW)).toBe(false);
    expect(await memberTextReadableBy('blog-comment', 'c1', 'reader', new Date(NOW.getTime() + 2 * 86_400_000))).toBe(
      true,
    );
  });
});

describe('the takedown', () => {
  it('deletes a guestbook entry, once', async () => {
    const { takeDownMemberText } = await import('@/lib/moderation/member-text-reports.server');
    expect(await takeDownMemberText('guestbook-entry', 'g1')).toBe(true);
    expect(h.entries.map((e) => e.id)).toEqual(['g2', 'g3']);
    expect(await takeDownMemberText('guestbook-entry', 'g1')).toBe(false);
  });

  it('soft-deletes a comment, keeps the first stamp, and touches no other comment', async () => {
    const { takeDownMemberText } = await import('@/lib/moderation/member-text-reports.server');
    expect(await takeDownMemberText('blog-comment', 'c1', NOW)).toBe(true);
    expect(h.comments[0]).toMatchObject({ id: 'c1', deletedAt: NOW });
    expect(await takeDownMemberText('blog-comment', 'c1', new Date('2027-02-01T00:00:00Z'))).toBe(false);
    expect(h.comments[0]).toMatchObject({ deletedAt: NOW });
    expect(h.comments[2]).toMatchObject({ id: 'c3', deletedAt: null });
  });

  it('is dispatched by the queue for both types', () => {
    const root = join(__dirname, '..', '..', '..');
    const triage = readFileSync(join(root, 'lib/moderation/triage.server.ts'), 'utf8');
    const takedown = triage.slice(triage.indexOf('async function takedownReportedContent'));
    for (const type of MEMBER_TEXT_REPORT_TYPES) expect(takedown).toContain(`'${type}'`);
    expect(takedown).toContain('takeDownMemberText');
  });
});

describe('the queue preview and "Your reports"', () => {
  it('gives a moderator the author, the place and the words, whatever the state', async () => {
    const { memberTextPreviews } = await import('@/lib/moderation/member-text-reports.server');
    const entries = await memberTextPreviews('guestbook-entry', ['g1', 'g2']);
    expect(entries.get('g1')).toBe("Guestbook entry by Name writer on Name owner's profile: Hello there");
    expect(entries.get('g2')).toBe(
      "Guestbook entry by Name writer on Name owner's profile (hidden by the owner): Hidden one",
    );
    const comments = await memberTextPreviews('blog-comment', ['c1', 'c2']);
    expect(comments.get('c1')).toBe('Comment by Name writer on the announcement "Big news": A comment');
    expect(comments.get('c2')).toBe('Comment by Name writer on the announcement "Big news" (deleted): Gone');
    assertJsonSafe([...entries.entries(), ...comments.entries()]);
  });

  it('shows the reporter their text only while it is live and by someone they have not blocked', async () => {
    const { memberTextTargets } = await import('@/lib/moderation/member-text-reports.server');
    const ids = { 'guestbook-entry': ['g1'], 'blog-comment': ['c1'] };
    const live = await memberTextTargets(ids, [], NOW);
    expect(live.map((t) => [t.type, t.id, t.href])).toEqual([
      ['guestbook-entry', 'g1', '/u/owner#guestbook'],
      ['blog-comment', 'c1', '/blog/big-news'],
    ]);
    assertJsonSafe(live);
    expect(await memberTextTargets(ids, ['writer'], NOW)).toEqual([]);
    h.entries[0]!.hiddenAt = new Date();
    h.comments[0]!.deletedAt = new Date();
    expect(await memberTextTargets(ids, [], NOW)).toEqual([]);
  });

  it('shows the kind and a "gone" line for each type, and looks each one up', () => {
    const root = join(__dirname, '..', '..', '..');
    const read = (p: string) => readFileSync(join(root, p), 'utf8');
    const panel = read('components/moderation/MyReportsPanel.tsx');
    const label = read('components/feed/report-kind-label.ts');
    for (const type of MEMBER_TEXT_REPORT_TYPES) {
      expect(panel).toContain(`t('kind-${type}'`);
      expect(panel).toContain(`t('gone-${type}'`);
      expect(label).toContain(`t('kind-${type}'`);
    }
    const mine = read('lib/moderation/my-reports.server.ts');
    expect(mine).toContain('memberTextTargets');
    for (const type of MEMBER_TEXT_REPORT_TYPES) expect(mine).toContain(`'${type}'`);
    expect(read('lib/moderation/triage.server.ts')).toContain('memberTextPreviews');
  });
});
