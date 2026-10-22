/**
 * A post composed into a series must not be a community post: a series page is
 * public and a private community's posts are members-only. The read side
 * (getSeriesView / navForPost) already filters such posts out; this keeps them
 * from being attached at compose time, matching addPostError.
 */
import { describe, expect, it, vi } from 'vitest';

const { findFirst } = vi.hoisted(() => ({ findFirst: vi.fn(async () => ({ postCount: 0 })) }));
vi.mock('@/lib/prisma.server', () => ({ prisma: { postSeries: { findFirst } } }));

import { seriesComposeError } from '@/lib/posts-plus/series.server';

describe('seriesComposeError', () => {
  it('refuses a community post before reading the series', async () => {
    findFirst.mockClear();
    expect(await seriesComposeError('u1', 's1', 'PUBLIC', 'c1')).toBe(
      'Community posts cannot be part of a series',
    );
    expect(findFirst).not.toHaveBeenCalled();
  });

  it('still allows a public, non-community post', async () => {
    expect(await seriesComposeError('u1', 's1', 'PUBLIC', null)).toBeNull();
    expect(await seriesComposeError('u1', 's1', undefined)).toBeNull();
  });
});
