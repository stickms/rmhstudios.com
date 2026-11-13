import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/prisma.server', () => ({ prisma: {} }));
vi.mock('@/lib/cached.server', () => ({ cached: vi.fn(), invalidateCached: vi.fn() }));
vi.mock('@prisma/client', () => ({ Prisma: { PrismaClientKnownRequestError: class extends Error {} } }));

import { applyAnnouncementFields } from '../sitewide-announcement.server';
import {
  ANNOUNCEMENT_DEFAULT_LIFETIME_DAYS,
  announcementExpiry,
  announcementVersion,
  isAnnouncementLive,
  saveAnnouncementFieldsSchema,
} from '../sitewide-announcement';
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
