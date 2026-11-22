/**
 * Content warning reasons (sprint 06 #16): a reason implies the warning, clearing clears both, a bad reason is refused;
 * RSS, notification previews and OG leave the text out for a post with a reason; the developer API returns both fields;
 * a scheduled post carries the reason to the published post.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const publishTx = vi.hoisted(() => ({
  rMHarkCreate: vi.fn(),
}));

vi.mock('@/lib/prisma.server', () => {
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([{ id: 'sp1' }]),
    rMHark: { create: (args: unknown) => publishTx.rMHarkCreate(args) },
    user: { update: vi.fn().mockResolvedValue({}) },
    community: { update: vi.fn().mockResolvedValue({}) },
    rMHarkPoll: { create: vi.fn().mockResolvedValue({}) },
    scheduledPost: { update: vi.fn().mockResolvedValue({}) },
  };
  return {
    prisma: {
      rMHark: { findMany: vi.fn().mockResolvedValue([]), count: vi.fn().mockResolvedValue(1) },
      user: { findFirst: vi.fn().mockResolvedValue({ id: 'u1', name: 'A', handle: 'a' }) },
      scheduledPost: { findUnique: vi.fn().mockResolvedValue(null) },
      $transaction: async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
    },
  };
});
vi.mock('@/lib/xp/engine.server', () => ({ awardXp: vi.fn() }));
vi.mock('@/lib/quests/engine.server', () => ({ progressQuests: vi.fn() }));
vi.mock('@/lib/achievements/engine.server', () => ({
  grantAchievement: vi.fn(),
  progressAchievement: vi.fn(),
}));
vi.mock('@/lib/notifications.server', () => ({ createNotification: vi.fn() }));
vi.mock('@/lib/communities/bans.server', () => ({ activeSanction: vi.fn().mockResolvedValue(null) }));
vi.mock('@/lib/communities/post-alerts.server', () => ({ enqueuePostAlert: vi.fn() }));

import { prisma } from '@/lib/prisma.server';
import {
  applyContentWarning,
  contentWarningNotice,
  MAX_CONTENT_WARNING_LENGTH,
  normalizeContentWarning,
  previewTextFor,
  resolveEditedContentWarning,
} from '@/lib/feed/content-warning';
import { contentWarningFieldSchema } from '@/lib/feed/content-warning-schema';
import { createRMHarkSchema, editRMHarkSchema } from '@/lib/rmhark-schema';
import { postCardContentWarning, postCardShowsContent } from '@/lib/og/post-visibility';
import { serializeOwnPost, serializePublicPost } from '@/lib/api/serializers.server';
import { publishScheduledPost } from '@/lib/scheduled/publish.server';
import { tagFeedItems, userFeedItems } from '@/lib/feed/rss.server';

const ROOT = join(__dirname, '..', '..', '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

describe('a reason implies the warning; clearing clears both', () => {
  it('stores sensitive with the reason', () => {
    expect(normalizeContentWarning({ contentWarning: 'Spoilers: Dune Part Two' })).toEqual({
      isSensitive: true,
      contentWarning: 'Spoilers: Dune Part Two',
    });
    expect(normalizeContentWarning({ isSensitive: true, contentWarning: '  Injury photo ' })).toEqual({
      isSensitive: true,
      contentWarning: 'Injury photo',
    });
  });

  it('a warning without a reason stays valid, as before', () => {
    expect(normalizeContentWarning({ isSensitive: true })).toEqual({ isSensitive: true, contentWarning: null });
    expect(normalizeContentWarning({ isSensitive: true, contentWarning: '   ' })).toEqual({
      isSensitive: true,
      contentWarning: null,
    });
    expect(normalizeContentWarning({})).toEqual({ isSensitive: false, contentWarning: null });
  });

  it('clearing the warning clears the reason too', () => {
    expect(normalizeContentWarning({ isSensitive: false, contentWarning: 'Spoilers' })).toEqual({
      isSensitive: false,
      contentWarning: null,
    });
    const existing = { isSensitive: true, contentWarning: 'Spoilers' };
    expect(resolveEditedContentWarning({ existing, nextSensitive: false, nextReason: undefined })).toEqual({
      isSensitive: false,
      contentWarning: null,
    });
    expect(resolveEditedContentWarning({ existing, nextSensitive: undefined, nextReason: null })).toEqual({
      isSensitive: true,
      contentWarning: null,
    });
    expect(resolveEditedContentWarning({ existing, nextSensitive: undefined, nextReason: undefined })).toEqual(
      existing,
    );
    expect(
      resolveEditedContentWarning({
        existing: { isSensitive: false, contentWarning: null },
        nextSensitive: undefined,
        nextReason: 'Injury photo',
      }),
    ).toEqual({ isSensitive: true, contentWarning: 'Injury photo' });
  });
});

describe('the reason is validated', () => {
  it('accepts 1 to 80 characters on one line', () => {
    expect(contentWarningFieldSchema.safeParse('Spoilers: Dune Part Two').success).toBe(true);
    expect(contentWarningFieldSchema.safeParse('x'.repeat(MAX_CONTENT_WARNING_LENGTH)).success).toBe(true);
    expect(contentWarningFieldSchema.safeParse(null).success).toBe(true);
    expect(contentWarningFieldSchema.safeParse(undefined).success).toBe(true);
  });

  it('refuses an over-long, blank or multi-line reason', () => {
    expect(contentWarningFieldSchema.safeParse('x'.repeat(MAX_CONTENT_WARNING_LENGTH + 1)).success).toBe(false);
    expect(contentWarningFieldSchema.safeParse('').success).toBe(false);
    expect(contentWarningFieldSchema.safeParse('   ').success).toBe(false);
    expect(contentWarningFieldSchema.safeParse('line one\nline two').success).toBe(false);
    expect(contentWarningFieldSchema.safeParse('tab\there').success).toBe(false);
  });

  it('the create and edit bodies take it', () => {
    expect(createRMHarkSchema.safeParse({ content: 'hi', contentWarning: 'Spoilers' }).success).toBe(true);
    expect(createRMHarkSchema.safeParse({ content: 'hi', contentWarning: 'a\nb' }).success).toBe(false);
    expect(editRMHarkSchema.safeParse({ content: 'hi', contentWarning: null, isSensitive: false }).success).toBe(true);
    expect(editRMHarkSchema.safeParse({ content: 'hi', contentWarning: 'x'.repeat(81) }).success).toBe(false);
  });

  it('is rendered as text and never interpreted', () => {
    const applied = applyContentWarning({ isSensitive: true, contentWarning: '<img src=x onerror=1>' });
    expect(applied.reason).toBe('<img src=x onerror=1>');
    for (const file of ['components/feed/CoveredLine.tsx', 'components/feed/ContentWarningCover.tsx']) {
      expect(read(file)).not.toContain('dangerouslySetInnerHTML');
    }
  });
});

describe('RSS leaves the text out of a post with a reason', () => {
  beforeEach(() => vi.mocked(prisma.rMHark.findMany).mockReset());

  it('a tag feed item carries the reason and none of the text', async () => {
    vi.mocked(prisma.rMHark.findMany).mockResolvedValue([
      {
        id: 'p1',
        content: 'Paul walks into the desert and the secret ending is revealed',
        contentWarning: 'Spoilers: Dune Part Two',
        createdAt: new Date('2026-11-01T00:00:00Z'),
        user: { handle: 'a', name: 'A' },
      },
      {
        id: 'p2',
        content: 'An ordinary post',
        contentWarning: null,
        createdAt: new Date('2026-11-02T00:00:00Z'),
        user: { handle: 'a', name: 'A' },
      },
    ] as never);
    const items = await tagFeedItems('dune');
    expect(items[0]!.description).toBe('Content warning: Spoilers: Dune Part Two');
    expect(items[0]!.title).toContain('Spoilers: Dune Part Two');
    expect(JSON.stringify(items[0])).not.toContain('secret ending');
    expect(items[1]!.description).toBe('An ordinary post');
  });

  it('a user feed does the same, and both feeds select the reason', async () => {
    vi.mocked(prisma.rMHark.findMany).mockResolvedValue([
      {
        id: 'p1',
        content: 'graphic detail',
        contentWarning: 'Injury photo',
        createdAt: new Date('2026-11-01T00:00:00Z'),
        user: { handle: 'a', name: 'A' },
      },
    ] as never);
    const feed = await userFeedItems('a');
    expect(feed?.items[0]!.description).toBe('Content warning: Injury photo');
    expect(JSON.stringify(feed?.items)).not.toContain('graphic detail');
    const args = vi.mocked(prisma.rMHark.findMany).mock.calls[0]![0] as { select: Record<string, boolean> };
    expect(args.select.contentWarning).toBe(true);
  });

  it('the RSS string goes through the server-side catalog, with an English default', () => {
    const src = read('lib/feed/rss.server.ts');
    expect(src).toContain('getServerI18n(DEFAULT_LOCALE)');
    expect(src).toContain("'content-warnings:rss-description'");
    const catalog = JSON.parse(read('locales/en/content-warnings.json')) as Record<string, string>;
    expect(catalog['rss-description']).toBe('Content warning: {{reason}}');
  });
});

describe('notification previews show the reason instead of the text', () => {
  it('previewTextFor swaps the text for the notice, and passes a post without a reason through', () => {
    expect(previewTextFor({ content: 'secret plot', contentWarning: 'Spoilers' })).toBe('Content warning: Spoilers');
    expect(previewTextFor({ content: 'hello', contentWarning: null })).toBe('hello');
    expect(previewTextFor({ content: 'hello' })).toBe('hello');
    expect(previewTextFor({ contentWarning: null })).toBeNull();
    expect(contentWarningNotice('x')).toBe('Content warning: x');
  });

  it.each([
    'lib/social/engagement.server.ts',
    'lib/feed/api/rmharks.$id.repost.server.ts',
    'lib/feed/notify-mentions.server.ts',
    'lib/discovery/watch.server.ts',
    'lib/discovery/alerts.server.ts',
  ])('%s builds its preview with previewTextFor', (file) => {
    expect(read(file)).toContain('previewTextFor(');
  });
});

describe('OG cards name the reason and draw nothing else', () => {
  const base = { audience: 'PUBLIC', deletedAt: null, unlockPrice: 0, community: null };

  it('a public warned post with a reason gets its reason, and no content card', () => {
    const post = { ...base, isSensitive: true, contentWarning: 'Spoilers: Dune Part Two' };
    expect(postCardShowsContent(post)).toBe(false);
    expect(postCardContentWarning(post)).toBe('Spoilers: Dune Part Two');
  });

  it('a warning without a reason stays a generic card', () => {
    expect(postCardContentWarning({ ...base, isSensitive: true, contentWarning: null })).toBeNull();
    expect(postCardContentWarning({ ...base, isSensitive: false, contentWarning: '' })).toBeNull();
  });

  it('never prints a reason for a post the gate hides anyway', () => {
    const warned = { isSensitive: true, contentWarning: 'Spoilers' };
    expect(postCardContentWarning({ ...base, ...warned, audience: 'FOLLOWERS' })).toBeNull();
    expect(postCardContentWarning({ ...base, ...warned, unlockPrice: 5 })).toBeNull();
    expect(postCardContentWarning({ ...base, ...warned, deletedAt: new Date() })).toBeNull();
    expect(postCardContentWarning({ ...base, ...warned, community: { isPrivate: true } })).toBeNull();
    expect(postCardContentWarning(null)).toBeNull();
  });

  it('the card routes and the post page head use it', () => {
    for (const file of [
      'lib/og/api/og.post.$id.server.ts',
      'lib/og/api/og.post.$id.story.server.ts',
      'app/routes/_site/u/$userid/post/$postid.tsx',
    ]) {
      const src = read(file);
      expect(src, file).toContain('postCardContentWarning(');
      expect(src, file).toContain('contentWarning: true');
    }
  });
});

describe('the developer API returns sensitive and contentWarning', () => {
  const row = {
    id: 'p1',
    content: 'text still returned',
    createdAt: new Date('2026-11-01T00:00:00Z'),
    likeCount: 1,
    commentCount: 0,
    repostCount: 0,
    viewCount: 2,
    isSensitive: true,
    contentWarning: 'Spoilers: Dune Part Two',
  };

  it('own posts', () => {
    const out = serializeOwnPost({ ...row, audience: 'PUBLIC' });
    expect(out.sensitive).toBe(true);
    expect(out.contentWarning).toBe('Spoilers: Dune Part Two');
    expect(out.content).toBe('text still returned');
  });

  it('public posts, and null when there is none', () => {
    const user = { id: 'u1', name: 'A', handle: 'a', image: null } as never;
    const warned = serializePublicPost({ ...row, user }, null);
    expect(warned.sensitive).toBe(true);
    expect(warned.contentWarning).toBe('Spoilers: Dune Part Two');
    const plain = serializePublicPost({ ...row, isSensitive: false, contentWarning: null, user }, null);
    expect(plain.sensitive).toBe(false);
    expect(plain.contentWarning).toBeNull();
    const missing = serializePublicPost({ ...row, isSensitive: undefined, contentWarning: undefined, user }, null);
    expect(missing.sensitive).toBe(false);
    expect(missing.contentWarning).toBeNull();
  });

  it.each([
    'app/routes/api/v1/feed.ts',
    'app/routes/api/v1/posts.ts',
    'app/routes/api/v1/posts/$id.ts',
    'app/routes/api/v1/users/$handle/posts.ts',
    'app/routes/api/v1/me/bookmarks.ts',
  ])('%s selects both columns', (file) => {
    const src = read(file);
    expect(src).toMatch(/isSensitive: true/);
    expect(src).toMatch(/contentWarning: true/);
  });

  it('the registry documents both, and the SDK types the reason as nullable', () => {
    expect(read('lib/api/registry.ts')).toMatch(/sensitive: false,\s*contentWarning: null/);
    expect(read('scripts/generate-sdk.ts')).toContain("contentWarning: 'string | null'");
  });
});

describe('a scheduled post carries the reason to the published post', () => {
  const sp = {
    id: 'sp1',
    userId: 'u1',
    content: 'Hello',
    gifUrl: null,
    gifAlt: null,
    imageUrls: [],
    imageAlts: [],
    audience: 'PUBLIC',
    isSensitive: false,
    replyControl: 'EVERYONE',
    unlockPrice: null,
    communityId: null,
    poll: null,
    publishedId: null,
    isCapsule: false,
    contentWarning: 'Spoilers: Dune Part Two',
  };

  beforeEach(() => {
    publishTx.rMHarkCreate.mockReset();
    publishTx.rMHarkCreate.mockResolvedValue({ id: 'post1' });
  });

  it('publishes with the reason, and the warning it implies', async () => {
    await publishScheduledPost(sp as never);
    const data = publishTx.rMHarkCreate.mock.calls[0]![0].data;
    expect(data.contentWarning).toBe('Spoilers: Dune Part Two');
    expect(data.isSensitive).toBe(true);
  });

  it('a post without a reason publishes as before', async () => {
    await publishScheduledPost({ ...sp, contentWarning: null } as never);
    const data = publishTx.rMHarkCreate.mock.calls[0]![0].data;
    expect(data.contentWarning).toBeNull();
    expect(data.isSensitive).toBe(false);
  });

  it('scheduling stores the normalized pair and the list returns it', () => {
    const create = read('lib/scheduled/api/scheduled.server.ts');
    expect(create).toContain(
      'normalizeContentWarning({ isSensitive: d.isSensitive, contentWarning: d.contentWarning })',
    );
    expect(read('lib/scheduled/list.server.ts')).toContain('contentWarning: r.contentWarning');
  });
});

describe('the schema and the migration', () => {
  it('adds the reason to both tables and the preference, additively', () => {
    const sql = read('prisma/migrations/20261126070000_s06_content_warnings/migration.sql');
    expect(sql).toContain('ALTER TABLE "rmheet" ADD COLUMN     "contentWarning" VARCHAR(80)');
    expect(sql).toContain('ALTER TABLE "scheduled_post" ADD COLUMN     "contentWarning" VARCHAR(80)');
    expect(sql).toContain(
      'ALTER TABLE "user_profile" ADD COLUMN     "showContentWarnings" BOOLEAN NOT NULL DEFAULT false',
    );
    expect(sql).not.toMatch(/DROP|ALTER COLUMN|RENAME/i);
    expect(read('prisma/schema/social.prisma')).toMatch(/contentWarning\s+String\?\s+@db\.VarChar\(80\)/);
    expect(read('prisma/schema/profile.prisma')).toMatch(/showContentWarnings\s+Boolean\s+@default\(false\)/);
  });
});
