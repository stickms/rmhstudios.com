import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  blogFind: vi.fn(),
  blogMany: vi.fn(),
  hark: vi.fn(),
  harkCreate: vi.fn(),
  tx: vi.fn(),
}));
vi.mock('@/lib/prisma.server', () => ({
  prisma: {
    blogPost: { findUnique: db.blogFind, updateMany: db.blogMany },
    rMHark: { findFirst: db.hark, create: db.harkCreate },
    user: { update: vi.fn() },
    $transaction: db.tx,
  },
}));
vi.mock('@/lib/feed-sse', () => ({ feedEventBus: { publishCreatedPost: vi.fn() } }));
vi.mock('@/lib/cached.server', () => ({ cached: vi.fn(), invalidateCached: vi.fn() }));
vi.mock('@prisma/client', () => ({ Prisma: { PrismaClientKnownRequestError: class extends Error {} } }));

import { applyAnnouncementFields, announcementPostContent, ensureAnnouncementPost } from '../sitewide-announcement.server';
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
