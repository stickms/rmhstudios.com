/** What a post's pinned vibe reveals, and to whom (paid, restricted, deleted, wrong-page version). */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  post: null as Record<string, unknown> | null,
  page: null as Record<string, unknown> | null,
  version: null as Record<string, unknown> | null,
  canView: true,
  versionWhere: null as Record<string, unknown> | null,
}));

vi.mock('@/lib/prisma.server', () => ({
  prisma: {
    rMHark: { findUnique: async () => h.post },
    vibePage: { findUnique: async () => h.page },
    vibePageVersion: {
      findFirst: async (a: { where: Record<string, unknown> }) => {
        h.versionWhere = a.where;
        // The query is scoped to the page: a version of another page is not found.
        return a.where.pageId === (h.version as { pageId: string } | null)?.pageId ? h.version : null;
      },
    },
  },
}));
vi.mock('@/lib/feed/audience.server', () => ({ canViewPost: async () => h.canView }));

import { getPostVibe, getVibeRunnable } from '../vibe-embed.server';

const page = { id: 'pg', slug: 'neon', kind: 'page', thumbnailUrl: null, status: 'ready', title: 'T', prompt: 'p', tweakValues: null };

beforeEach(() => {
  h.canView = true;
  h.post = {
    id: 'p1',
    userId: 'author',
    audience: 'PUBLIC',
    communityId: null,
    deletedAt: null,
    unlockPrice: null,
    unlocks: [],
    vibeEmbed: { versionId: 'v1', page },
  };
  h.page = page;
  h.version = { pageId: 'pg', id: 'v1', title: 'V', description: null, html: '<p>x</p>', tweakSpec: [] };
});

describe('getPostVibe', () => {
  it('serves a public post', async () => {
    expect(await getPostVibe('p1', null)).toMatchObject({ slug: 'neon', versionId: 'v1' });
  });

  it('hides a post the stranger may not view', async () => {
    h.canView = false;
    expect(await getPostVibe('p1', 'stranger')).toBeNull();
  });

  it('hides a deleted post', async () => {
    h.post!.deletedAt = new Date();
    expect(await getPostVibe('p1', 'author')).toBeNull();
  });

  it('hides a paid post from a viewer who has not unlocked it, shows it to the author and an unlocker', async () => {
    h.post!.unlockPrice = 50;
    expect(await getPostVibe('p1', 'stranger')).toBeNull();
    expect(await getPostVibe('p1', null)).toBeNull();
    expect(await getPostVibe('p1', 'author')).not.toBeNull();
    h.post!.unlocks = [{ id: 'u' }];
    expect(await getPostVibe('p1', 'payer')).not.toBeNull();
  });

  it('still serves the pinned version after the page rebuilds', async () => {
    (h.post!.vibeEmbed as { page: { status: string } }).page.status = 'generating';
    expect(await getPostVibe('p1', null)).not.toBeNull();
  });

  it('returns null when the pinned version is not the page own', async () => {
    h.version = { pageId: 'other', id: 'v1' };
    expect(await getPostVibe('p1', null)).toBeNull();
  });
});

describe('getVibeRunnable', () => {
  it('refuses a version of another page', async () => {
    h.version = { pageId: 'other', id: 'v9', title: null, description: null, html: '', tweakSpec: [] };
    expect(await getVibeRunnable('neon', 'v9')).toBeNull();
    expect(h.versionWhere).toMatchObject({ id: 'v9', pageId: 'pg' });
  });

  it('needs a ready page for the latest, not for a named version', async () => {
    h.page = { ...page, status: 'generating' };
    expect(await getVibeRunnable('neon', undefined)).toBeNull();
    expect(await getVibeRunnable('neon', 'v1')).toMatchObject({ versionId: 'v1', html: '<p>x</p>' });
  });
});
