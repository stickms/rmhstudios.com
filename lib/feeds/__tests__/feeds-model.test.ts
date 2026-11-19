/**
 * The Feed model fold (2026-11-19): lists, saved searches and keyword alerts
 * are `CustomFeed` rows. These pin the two places where a mistake leaks user
 * data or loses an alert: who may read a feed copied from a list, and that the
 * post fan-out still finds alerts (now `notify` feeds with an anchor).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  feedFindMany: vi.fn(),
  hitCreate: vi.fn(),
  notify: vi.fn(),
}));

vi.mock('@/lib/prisma.server', () => ({
  prisma: {
    customFeed: { findMany: h.feedFindMany },
    keywordAlertHit: { createManyAndReturn: h.hitCreate },
  },
}));
vi.mock('@/lib/notifications.server', () => ({ createNotification: h.notify }));
vi.mock('@/lib/moderation.server', () => ({ getHiddenAuthorIds: async () => [] }));
vi.mock('@/lib/feed/timeline', () => ({ getMutedWords: async () => [] }));

import { readableByOthers, toFeedSource } from '@/lib/feeds/feeds.server';
import { fanOutKeywordAlerts } from '@/lib/discovery/alerts.server';

beforeEach(() => {
  h.feedFindMany.mockReset();
  h.hitCreate.mockReset();
  h.notify.mockReset();
});

describe('readableByOthers', () => {
  it('keeps a private list private and an unlisted list readable by link', () => {
    expect(readableByOthers({ isPublic: false, visibility: 'PRIVATE' })).toBe(false);
    expect(readableByOthers({ isPublic: false, visibility: 'UNLISTED' })).toBe(true);
  });

  it('treats a feed the previous release published as public before its visibility is backfilled', () => {
    expect(readableByOthers({ isPublic: true, visibility: 'PRIVATE' })).toBe(true);
  });
});

describe('toFeedSource', () => {
  it('reads an alert by its query and ignores the query of a saved search', () => {
    const base = { id: 'f', tags: null, keywords: null, query: '"slice it" -leak' };
    expect(toFeedSource({ ...base, kind: 'alert' })).toEqual({
      id: 'f',
      tags: [],
      keywords: [],
      alertQuery: '"slice it" -leak',
    });
    expect(toFeedSource({ ...base, kind: 'search' }).alertQuery).toBeNull();
  });
});

describe('fanOutKeywordAlerts', () => {
  it('matches notify feeds by anchor and notifies their owners once', async () => {
    h.feedFindMany.mockResolvedValue([{ ownerId: 'u2', query: '"slice it" -leak' }]);
    h.hitCreate.mockResolvedValue([{ userId: 'u2' }]);
    const n = await fanOutKeywordAlerts({
      id: 'p1',
      userId: 'u1',
      content: 'Slice-it charts are up',
      handle: 'alice',
    });
    expect(n).toBe(1);
    const where = h.feedFindMany.mock.calls[0][0].where;
    expect(where.notify).toBe(true);
    expect(where.ownerId).toEqual({ not: 'u1' });
    expect(where.anchor.in).toContain('slice');
    expect(h.notify).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u2', entityType: 'keyword-alert', entityId: 'p1' }),
    );
  });

  it('does not notify when an excluded word is present', async () => {
    h.feedFindMany.mockResolvedValue([{ ownerId: 'u2', query: '"slice it" -leak' }]);
    const n = await fanOutKeywordAlerts({
      id: 'p2',
      userId: 'u1',
      content: 'slice it leak',
      handle: null,
    });
    expect(n).toBe(0);
    expect(h.hitCreate).not.toHaveBeenCalled();
  });
});
