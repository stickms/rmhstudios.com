import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  blogFind: vi.fn(),
  blogMany: vi.fn(),
  hark: vi.fn(),
  harkCreate: vi.fn(),
  tx: vi.fn(),
  blogMany2: vi.fn(),
  audit: vi.fn(),
  userFind: vi.fn(),
  cached: vi.fn(),
}));
vi.mock('@/lib/prisma.server', () => ({
  prisma: {
    blogPost: { findUnique: db.blogFind, updateMany: db.blogMany, findMany: db.blogMany2 },
    adminAuditLog: { findFirst: db.audit },
    rMHark: { findFirst: db.hark, create: db.harkCreate },
    user: { update: vi.fn(), findUnique: db.userFind },
    $transaction: db.tx,
  },
}));
vi.mock('@/lib/feed-sse', () => ({ feedEventBus: { publishCreatedPost: vi.fn() } }));
vi.mock('@/lib/cached.server', () => ({ cached: db.cached, invalidateCached: vi.fn() }));
vi.mock('@prisma/client', () => ({ Prisma: { PrismaClientKnownRequestError: class extends Error {} } }));

import {
  applyAnnouncementFields,
  announcementPostContent,
  ensureAnnouncementPost,
  findAnnouncementAuthorId,
  getCurrentAnnouncement,
} from '../sitewide-announcement.server';
import {
  ANNOUNCEMENT_DEFAULT_LIFETIME_DAYS,
  announcementExpiry,
  announcementVersion,
  isAnnouncementLive,
} from '../sitewide-announcement';
import { saveAnnouncementFieldsSchema } from '../sitewide-announcement-schema';
import { getBusiness, isBusinessId } from '../businesses';

const now = new Date('2026-11-12T12:00:00Z');
const earlier = new Date('2026-11-01T00:00:00Z');
const input = (o: Record<string, unknown> = {}) => saveAnnouncementFieldsSchema.parse({ announcement: true, ...o });

describe('applyAnnouncementFields', () => {
  it('new post with flag on is announced now', () => {
    const r = applyAnnouncementFields(null, input(), now);
    expect(r.reannounced).toBe(true);
    expect(r.data.announcedAt).toEqual(now);
    expect(r.data.announcementExpiresAt).toBeNull();
  });
  it('false -> true re-announces', () => {
    const r = applyAnnouncementFields({ announcement: false, announcedAt: earlier }, input(), now);
    expect(r.reannounced).toBe(true);
    expect(r.data.announcedAt).toEqual(now);
  });
  it('stays true keeps announcedAt', () => {
    const r = applyAnnouncementFields({ announcement: true, announcedAt: earlier }, input(), now);
    expect(r.reannounced).toBe(false);
    expect(r.data.announcedAt).toEqual(earlier);
  });
  it('turning off keeps announcedAt', () => {
    const r = applyAnnouncementFields(
      { announcement: true, announcedAt: earlier },
      input({ announcement: false }),
      now,
    );
    expect(r.data.announcement).toBe(false);
    expect(r.reannounced).toBe(false);
    expect(r.data.announcedAt).toEqual(earlier);
  });
  it('stores explicit expiry', () => {
    const r = applyAnnouncementFields(null, input({ announcementExpiresAt: '2026-12-01T00:00:00Z' }), now);
    expect(r.data.announcementExpiresAt).toEqual(new Date('2026-12-01T00:00:00Z'));
  });
});

describe('shared helpers', () => {
  it('expiry defaults and liveness', () => {
    const exp = announcementExpiry(earlier);
    expect(exp.getTime() - earlier.getTime()).toBe(ANNOUNCEMENT_DEFAULT_LIFETIME_DAYS * 86400000);
    const explicit = new Date('2026-11-05T00:00:00Z');
    expect(announcementExpiry(earlier, explicit)).toBe(explicit);
    expect(isAnnouncementLive({ expiresAt: exp.toISOString() }, earlier.getTime())).toBe(true);
    expect(isAnnouncementLive({ expiresAt: exp.toISOString() }, exp.getTime() + 1)).toBe(false);
    expect(isAnnouncementLive({ expiresAt: 'garbage' })).toBe(false);
  });
  it('version changes with announcedAt', () => {
    expect(announcementVersion({ id: 'a', announcedAt: 'x' })).not.toBe(announcementVersion({ id: 'a', announcedAt: 'y' }));
  });
  it('schema validation', () => {
    expect(saveAnnouncementFieldsSchema.safeParse({ announcement: true, business: 'nope' }).success).toBe(false);
    expect(saveAnnouncementFieldsSchema.safeParse({ announcementExpiresAt: '' }).success).toBe(true);
    expect(saveAnnouncementFieldsSchema.safeParse({ announcementExpiresAt: null }).success).toBe(true);
    expect(saveAnnouncementFieldsSchema.safeParse({ announcementExpiresAt: 'tomorrow' }).success).toBe(false);
  });
  it('business fallback', () => {
    expect(isBusinessId('rmh-capital')).toBe(true);
    expect(isBusinessId('x')).toBe(false);
    expect(getBusiness('x').id).toBe('rmh-studios');
    expect(getBusiness(null).id).toBe('rmh-studios');
  });
});

describe('announcementPostContent', () => {
  const base = { title: 'We shipped a thing', description: 'It does a thing for you.', slug: 'a-thing', business: 'rmh' };
  it('leads with the business, then the title, description and link', () => {
    const text = announcementPostContent(base);
    expect(text).toMatch(/announcement: We shipped a thing\. It does a thing for you\.\nhttps:\/\/rmhstudios\.com\/blog\/a-thing$/);
  });
  it('never exceeds the limit and never cuts the link', () => {
    const long = { ...base, title: 'T'.repeat(400), description: 'D'.repeat(900), slug: 's'.repeat(60) };
    const text = announcementPostContent(long);
    expect(text.length).toBeLessThanOrEqual(280);
    expect(text.endsWith(`/blog/${'s'.repeat(60)}`)).toBe(true);
    const longDesc = announcementPostContent({ ...base, description: 'word '.repeat(200) });
    expect(longDesc.length).toBeLessThanOrEqual(280);
    expect(longDesc).toContain('/blog/a-thing');
  });
  it('has no exclamation marks, emoji or hashtags', () => {
    const text = announcementPostContent({ ...base, title: 'Big news!', description: 'Wow! #launch' });
    expect(text).not.toContain('!');
    expect(text).not.toMatch(/\p{Extended_Pictographic}/u);
  });
});

describe('ensureAnnouncementPost', () => {
  const row = { id: 'b1', slug: 's', title: 'T', description: 'D', business: 'rmh', announcement: true };
  beforeEach(() => {
    vi.clearAllMocks();
    db.tx.mockImplementation(async (fn: (tx: unknown) => unknown) =>
      fn({
        blogPost: { updateMany: db.blogMany },
        rMHark: { create: db.harkCreate },
        user: { update: vi.fn() },
      }),
    );
    db.harkCreate.mockImplementation(async ({ data }: { data: { id: string; content: string } }) => ({
      id: data.id,
      content: data.content,
      createdAt: new Date(),
      replyControl: 'EVERYONE',
      user: { id: 'u', name: 'A' },
    }));
  });
  it('returns null for a post that is not an announcement', async () => {
    db.blogFind.mockResolvedValue({ ...row, announcement: false, announcementPostId: null });
    expect(await ensureAnnouncementPost({ blogPostId: 'b1', authorId: 'u' })).toBeNull();
    expect(db.harkCreate).not.toHaveBeenCalled();
  });
  it('creates one post and links it', async () => {
    db.blogFind.mockResolvedValue({ ...row, announcementPostId: null });
    db.blogMany.mockResolvedValue({ count: 1 });
    const id = await ensureAnnouncementPost({ blogPostId: 'b1', authorId: 'u' });
    expect(id).toBeTruthy();
    expect(db.harkCreate).toHaveBeenCalledTimes(1);
    expect(db.blogMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ announcementPostId: null }), data: { announcementPostId: id } }),
    );
  });
  it('reuses a live discussion post', async () => {
    db.blogFind.mockResolvedValue({ ...row, announcementPostId: 'p1' });
    db.hark.mockResolvedValue({ id: 'p1' });
    expect(await ensureAnnouncementPost({ blogPostId: 'b1', authorId: 'u' })).toBe('p1');
    expect(db.harkCreate).not.toHaveBeenCalled();
  });
  it('creates a second post for nobody when the claim is lost', async () => {
    db.blogFind
      .mockResolvedValueOnce({ ...row, announcementPostId: null })
      .mockResolvedValueOnce({ announcementPostId: 'winner' });
    db.blogMany.mockResolvedValue({ count: 0 });
    expect(await ensureAnnouncementPost({ blogPostId: 'b1', authorId: 'u' })).toBe('winner');
    expect(db.harkCreate).not.toHaveBeenCalled();
  });
});

describe('findAnnouncementAuthorId', () => {
  beforeEach(() => vi.clearAllMocks());
  it('returns the admin of the newest blog.edit/blog.create row', async () => {
    db.audit.mockResolvedValue({ adminId: 'admin1' });
    db.userFind.mockResolvedValue({ id: 'admin1' });
    expect(await findAnnouncementAuthorId('my-post')).toBe('admin1');
    expect(db.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { targetType: 'BlogPost', targetId: 'my-post', action: { in: ['blog.edit', 'blog.create'] } },
        orderBy: { createdAt: 'desc' },
      }),
    );
  });
  it('returns null with no audit row, or when the admin account is gone', async () => {
    db.audit.mockResolvedValue(null);
    expect(await findAnnouncementAuthorId('x')).toBeNull();
    db.audit.mockResolvedValue({ adminId: 'gone' });
    db.userFind.mockResolvedValue(null);
    expect(await findAnnouncementAuthorId('x')).toBeNull();
  });
});

describe('getCurrentAnnouncement discussion backfill', () => {
  let nowMs = Date.parse('2026-11-14T12:00:00Z');
  const live = (id: string) => ({
    id,
    slug: `slug-${id}`,
    title: 'T',
    description: 'D',
    image: null,
    content: 'c',
    business: 'rmh',
    announcedAt: new Date('2026-11-13T00:00:00Z'),
    announcementExpiresAt: null,
    announcementPostId: null,
  });
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(Date, 'now').mockImplementation(() => nowMs);
    db.cached.mockImplementation(async (_k: string, _t: number, loader: () => unknown) => loader());
    db.tx.mockImplementation(async (fn: (tx: unknown) => unknown) =>
      fn({ blogPost: { updateMany: db.blogMany }, rMHark: { create: db.harkCreate }, user: { update: vi.fn() } }),
    );
    db.blogMany.mockResolvedValue({ count: 1 });
    db.harkCreate.mockImplementation(async ({ data }: { data: { id: string; content: string } }) => ({
      id: data.id,
      content: data.content,
      createdAt: new Date(),
      replyControl: 'EVERYONE',
      user: { id: 'u', name: 'A' },
    }));
  });

  it('creates the missing discussion post, authored by the last admin to save', async () => {
    db.blogMany2.mockResolvedValue([live('bf1')]);
    db.audit.mockResolvedValue({ adminId: 'admin1' });
    db.userFind.mockResolvedValue({ id: 'admin1' });
    db.blogFind.mockResolvedValue({ id: 'bf1', slug: 'slug-bf1', title: 'T', description: 'D', business: 'rmh', announcement: true, announcementPostId: null });
    const r = await getCurrentAnnouncement();
    expect(r?.discussionPostId).toBeTruthy();
    expect(db.harkCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ userId: 'admin1' }) }));
  });

  it('creates nothing and returns null when no admin is known', async () => {
    db.blogMany2.mockResolvedValue([live('bf2')]);
    db.audit.mockResolvedValue(null);
    const r = await getCurrentAnnouncement();
    expect(r?.discussionPostId).toBeNull();
    expect(db.harkCreate).not.toHaveBeenCalled();
  });

  it('does not retry per request when it keeps failing, but retries after a minute', async () => {
    db.blogMany2.mockResolvedValue([live('bf3')]);
    db.audit.mockRejectedValue(new Error('db down'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect((await getCurrentAnnouncement())?.discussionPostId).toBeNull();
    await getCurrentAnnouncement();
    await getCurrentAnnouncement();
    expect(db.audit).toHaveBeenCalledTimes(1);
    nowMs += 61_000;
    await getCurrentAnnouncement();
    expect(db.audit).toHaveBeenCalledTimes(2);
  });
});
