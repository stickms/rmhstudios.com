import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Following a news story (s13-12): follow, unfollow and the cap under the lock; linking a published article queues one
 * fan-out run that tells each follower once (a resumed run skips those told); an unlink, a draft article, banned and
 * pending-deletion followers tell nobody. Prisma is a small in-memory fake.
 */

const NOW = new Date('2026-12-21T12:00:00Z');
const DAY = 86_400_000;

interface Follower {
  userId: string;
  bannedUntil: Date | null;
  deletionScheduledAt: Date | null;
}

const db = vi.hoisted(() => ({
  stories: [] as { id: string; slug: string; title: string }[],
  articles: [] as { id: string; slug: string; title: string; status: string }[],
  subs: [] as { userId: string; kind: string; target: string }[],
  links: [] as { storyId: string; articleSlug: string }[],
  follows: [] as { storyId: string; userId: string }[],
  followers: [] as { userId: string; bannedUntil: Date | null; deletionScheduledAt: Date | null }[],
  notes: [] as Record<string, unknown>[],
  created: [] as Record<string, unknown>[],
  fanoutRuns: [] as unknown[],
  locks: [] as string[],
  boss: null as null | { send: ReturnType<typeof vi.fn> },
}));

vi.mock('@/lib/jobs/boss.server', () => ({ getBoss: async () => db.boss }));
vi.mock('@/lib/db/advisory-lock.server', () => ({
  lockKey: async (_tx: unknown, key: string) => {
    db.locks.push(key);
  },
}));
vi.mock('@/lib/search/embeddings.server', () => ({
  isEmbeddingStoreReady: async () => false,
  similarTo: async () => [],
}));
vi.mock('@/lib/notifications.server', () => ({
  createNotification: vi.fn(async (input: Record<string, unknown>) => {
    db.created.push(input);
  }),
}));
vi.mock('@/lib/prisma.server', async () => {
  const { createFanoutRunFake } = await import('@/lib/fanout/__tests__/fake-fanout-run');
  const fanout = createFanoutRunFake(db.fanoutRuns as never);
  const models = {
    newsStory: {
      findUnique: async ({ where }: { where: { id?: string; slug?: string } }) =>
        db.stories.find((s) => (where.id ? s.id === where.id : s.slug === where.slug)) ?? null,
      update: async () => ({}),
    },
    newsArticle: {
      findUnique: async ({ where }: { where: { slug: string } }) =>
        db.articles.find((a) => a.slug === where.slug) ?? null,
    },
    newsStoryArticle: {
      findUnique: async ({ where }: { where: { articleSlug: string } }) => {
        const link = db.links.find((l) => l.articleSlug === where.articleSlug);
        if (!link) return null;
        const story = db.stories.find((s) => s.id === link.storyId)!;
        return { storyId: link.storyId, story: { title: story.title } };
      },
      upsert: async ({ create }: { create: { storyId: string; articleSlug: string } }) => {
        const at = db.links.findIndex((l) => l.articleSlug === create.articleSlug);
        if (at >= 0) db.links[at] = create;
        else db.links.push(create);
      },
      deleteMany: async ({ where }: { where: { articleSlug: string } }) => {
        const before = db.links.length;
        db.links = db.links.filter((l) => l.articleSlug !== where.articleSlug);
        return { count: before - db.links.length };
      },
    },
    newsStoryFollow: {
      findUnique: async ({ where }: { where: { storyId_userId: { storyId: string; userId: string } } }) =>
        db.follows.find(
          (f) => f.storyId === where.storyId_userId.storyId && f.userId === where.storyId_userId.userId,
        ) ?? null,
      count: async ({ where }: { where: { userId: string } }) =>
        db.follows.filter((f) => f.userId === where.userId).length,
      create: async ({ data }: { data: { storyId: string; userId: string } }) => {
        db.follows.push(data);
      },
      deleteMany: async ({ where }: { where: { userId: string; story: { slug: string } } }) => {
        const story = db.stories.find((s) => s.slug === where.story.slug);
        db.follows = db.follows.filter((f) => !(f.userId === where.userId && f.storyId === story?.id));
      },
      findFirst: async ({ where }: { where: { userId: string; story: { slug: string } } }) => {
        const story = db.stories.find((s) => s.slug === where.story.slug);
        return db.follows.find((f) => f.userId === where.userId && f.storyId === story?.id) ?? null;
      },
    },
    readingSubscription: {
      findFirst: async ({ where }: { where: { userId: string; target: string } }) =>
        db.subs.find((x) => x.userId === where.userId && x.kind === 'news_story' && x.target === where.target)
          ? { id: 'sub' }
          : null,
      deleteMany: async ({ where }: { where: { userId: string; target: string } }) => {
        db.subs = db.subs.filter((x) => !(x.userId === where.userId && x.target === where.target));
      },
    },
    user: {
      findMany: async ({ where, take }: { where: { id?: { gt: string } }; take: number }) =>
        db.followers
          .filter((f) => !where.id || f.userId > where.id.gt)
          .sort((x, y) => (x.userId < y.userId ? -1 : 1))
          .slice(0, take)
          .map((f) => ({ id: f.userId, bannedUntil: f.bannedUntil, deletionScheduledAt: f.deletionScheduledAt })),
    },
    notification: {
      findMany: async ({ where }: { where: { userId: { in: string[] } } }) =>
        db.notes.filter((n) => where.userId.in.includes(n.userId as string)),
    },
  };
  return {
    prisma: {
      ...models,
      fanoutRun: fanout.fanoutRun,
      $transaction: async (fn: (tx: typeof models) => unknown) => fn(models),
    },
  };
});

import { createNotification } from '@/lib/notifications.server';
import { noticeFallbackText } from '@/lib/notifications/notice-keys';
import { followStory, isFollowingStory, linkArticle, unfollowStory, unlinkArticle } from '@/lib/reading/stories.server';
import { enqueueStoryArticleFanout, runStoryArticleFanout } from '@/lib/reading/story-follows.server';
import { NEWS_STORY_FOLLOW_LIMIT, STORY_FANOUT_QUEUE, storyFanoutJobKey } from '@/lib/reading/story-follows';

const follower = (id: string, over: Partial<Follower> = {}): Follower => ({
  userId: id,
  bannedUntil: null,
  deletionScheduledAt: null,
  ...over,
});
const told = () => db.created.map((c) => c.userId as string);

beforeEach(() => {
  db.stories = [{ id: 'st1', slug: 'big-story', title: 'The big story' }];
  db.subs = [];
  db.articles = [{ id: 'ar1', slug: 'first-article', title: 'First: a "quoted" <headline>', status: 'PUBLISHED' }];
  db.links = [];
  db.follows = [];
  db.followers = [];
  db.notes = [];
  db.created = [];
  db.fanoutRuns.length = 0;
  db.locks = [];
  db.boss = { send: vi.fn(async () => 'job') };
  vi.mocked(createNotification).mockReset();
  vi.mocked(createNotification).mockImplementation(async (input) => {
    db.created.push({ ...input });
  });
});

describe('follow and unfollow', () => {
  it('follows a story, twice is once, and the state reads back', async () => {
    expect(await followStory('u1', 'big-story')).toEqual({ ok: true, following: true });
    expect(await followStory('u1', 'big-story')).toEqual({ ok: true, following: true });
    expect(db.follows).toEqual([{ storyId: 'st1', userId: 'u1' }]);
    expect(await isFollowingStory('u1', 'big-story')).toBe(true);
    expect(await isFollowingStory('u2', 'big-story')).toBe(false);
  });

  it('refuses a story that does not exist', async () => {
    expect(await followStory('u1', 'nope')).toEqual({ ok: false, code: 'NOT_FOUND' });
    expect(db.follows).toHaveLength(0);
  });

  it('unfollows, and unfollowing again changes nothing', async () => {
    await followStory('u1', 'big-story');
    await unfollowStory('u1', 'big-story');
    await unfollowStory('u1', 'big-story');
    expect(db.follows).toHaveLength(0);
    expect(await isFollowingStory('u1', 'big-story')).toBe(false);
  });

  it('shows an older reading subscription as following, and one unfollow removes both', async () => {
    db.subs = [{ userId: 'u1', kind: 'news_story', target: 'big-story' }];
    expect(await isFollowingStory('u1', 'big-story')).toBe(true);
    await followStory('u1', 'big-story');
    await unfollowStory('u1', 'big-story');
    expect(db.subs).toHaveLength(0);
    expect(db.follows).toHaveLength(0);
    expect(await isFollowingStory('u1', 'big-story')).toBe(false);
  });

  it('counts the cap under the member lock and refuses the 201st story', async () => {
    db.follows = Array.from({ length: NEWS_STORY_FOLLOW_LIMIT }, (_, i) => ({ storyId: `other-${i}`, userId: 'u1' }));
    expect(await followStory('u1', 'big-story')).toEqual({
      ok: false,
      code: 'NEWS_STORY_FOLLOW_LIMIT',
      max: NEWS_STORY_FOLLOW_LIMIT,
    });
    expect(db.locks).toContain('news-story-follows:u1');
    expect(db.follows).toHaveLength(NEWS_STORY_FOLLOW_LIMIT);
    // Someone already following at the cap is still "following", not refused.
    db.follows[0] = { storyId: 'st1', userId: 'u1' };
    expect(await followStory('u1', 'big-story')).toEqual({ ok: true, following: true });
  });
});

describe('linking an article', () => {
  it('queues one keyed job for a published article, after the link is written', async () => {
    expect(await linkArticle('st1', 'first-article')).toBe(true);
    expect(db.links).toEqual([{ storyId: 'st1', articleSlug: 'first-article' }]);
    expect(db.boss!.send).toHaveBeenCalledTimes(1);
    expect(db.boss!.send).toHaveBeenCalledWith(
      STORY_FANOUT_QUEUE,
      { storyId: 'st1', articleSlug: 'first-article' },
      expect.objectContaining({ singletonKey: storyFanoutJobKey('st1', 'first-article') }),
    );
  });

  it('queues nothing for an article that is not published, or a story or article that does not exist', async () => {
    db.articles.push({ id: 'ar-draft', slug: 'draft', title: 'Draft', status: 'DRAFT' });
    expect(await linkArticle('st1', 'draft')).toBe(true);
    expect(await linkArticle('st1', 'missing')).toBe(false);
    expect(await linkArticle('nope', 'first-article')).toBe(false);
    expect(db.boss!.send).not.toHaveBeenCalled();
  });

  it('an unlink queues and notifies nobody', async () => {
    db.followers = [follower('a')];
    await linkArticle('st1', 'first-article');
    db.boss!.send.mockClear();
    expect(await unlinkArticle('first-article')).toBe(true);
    expect(db.boss!.send).not.toHaveBeenCalled();
    // A job that was already queued finds the article gone from the story and tells nobody.
    expect((await runStoryArticleFanout('st1', 'first-article', NOW)).notified).toBe(0);
    expect(db.created).toHaveLength(0);
  });

  it('a queue that is down is logged, never thrown (the link exists)', async () => {
    db.boss = null;
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(enqueueStoryArticleFanout('st1', 'first-article')).resolves.toBeUndefined();
    expect(await linkArticle('st1', 'first-article')).toBe(true);
    expect(db.links).toHaveLength(1);
    spy.mockRestore();
  });
});

describe('who the notice reaches', () => {
  beforeEach(() => {
    db.links = [{ storyId: 'st1', articleSlug: 'first-article' }];
  });

  it('tells each follower once, with a notice that links to the article', async () => {
    db.followers = [follower('a'), follower('b'), follower('c')];
    const result = await runStoryArticleFanout('st1', 'first-article', NOW);
    expect(result.notified).toBe(3);
    expect(told()).toEqual(['a', 'b', 'c']);
    expect(db.created[0]).toMatchObject({
      type: 'SYSTEM',
      entityType: 'news_story',
      entityId: 'st1',
      link: '/news/first-article',
    });
    expect(noticeFallbackText(db.created[0]!.preview as never)).toBe('The big story: First: a "quoted" <headline>');
    expect(db.fanoutRuns[0]).toMatchObject({
      kind: 'news-story-article',
      subjectId: 'st1:first-article',
      status: 'DONE',
      sent: 3,
    });
  });

  it('linking the same article again tells nobody twice', async () => {
    db.followers = [follower('a'), follower('b')];
    await runStoryArticleFanout('st1', 'first-article', NOW);
    expect((await runStoryArticleFanout('st1', 'first-article', NOW)).notified).toBe(0);
    expect(told()).toEqual(['a', 'b']);
  });

  it('skips banned, pending-deletion and erased followers, and tells one whose ban has lapsed', async () => {
    db.followers = [
      follower('ok'),
      follower('banned', { bannedUntil: new Date(NOW.getTime() + DAY) }),
      follower('lapsed', { bannedUntil: new Date(NOW.getTime() - DAY) }),
      follower('leaving', { deletionScheduledAt: NOW }),
    ];
    const result = await runStoryArticleFanout('st1', 'first-article', NOW);
    expect(told()).toEqual(['lapsed', 'ok']);
    expect(result.notified).toBe(2);
  });

  it('also tells a reading subscriber once, and not one the reading fan-out already told', async () => {
    db.followers = [follower('sub'), follower('both')];
    db.notes = [
      { userId: 'both', type: 'SYSTEM', entityType: 'news_article', entityId: 'ar1', link: '/news/first-article' },
    ];
    await runStoryArticleFanout('st1', 'first-article', NOW);
    expect(told()).toEqual(['sub']);
  });

  it('tells nobody about a draft, or an article that sits in another story', async () => {
    db.followers = [follower('a')];
    db.articles[0]!.status = 'DRAFT';
    expect((await runStoryArticleFanout('st1', 'first-article', NOW)).notified).toBe(0);
    db.articles[0]!.status = 'PUBLISHED';
    db.links = [{ storyId: 'st2', articleSlug: 'first-article' }];
    db.stories.push({ id: 'st2', slug: 'other', title: 'Other' });
    expect((await runStoryArticleFanout('st1', 'first-article', NOW)).notified).toBe(0);
    expect(db.created).toHaveLength(0);
  });

  it('after a worker dies mid-run, tells each of 450 followers exactly once', async () => {
    db.followers = Array.from({ length: 450 }, (_, i) => follower(`u${String(i).padStart(4, '0')}`));
    let calls = 0;
    vi.mocked(createNotification).mockImplementation(async (input) => {
      // The worker dies in the middle of the second batch (after 200 + 50).
      if (++calls === 251) throw new Error('killed');
      db.created.push({ ...input });
      db.notes.push({
        userId: input.userId,
        type: 'SYSTEM',
        entityType: 'news_story',
        link: input.link,
        createdAt: NOW,
      });
    });
    await expect(runStoryArticleFanout('st1', 'first-article', NOW)).rejects.toThrow('killed');
    expect(db.fanoutRuns[0]).toMatchObject({ status: 'RUNNING', cursor: 'u0199', sent: 200 });
    const resumed = await runStoryArticleFanout('st1', 'first-article', NOW);
    expect(resumed.notified).toBe(450);
    expect(new Set(told()).size).toBe(450);
    expect(told()).toHaveLength(450);
  });
});
