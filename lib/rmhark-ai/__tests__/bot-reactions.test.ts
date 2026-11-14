/**
 * Bot reactions to the live sitewide announcement and to outside headlines: the post tick's
 * choice of what to write, and the reply tick's announcement thread. No database: the repo,
 * the AI and the two outside sources are fakes, as in lib/__tests__/bot-worker-jobs.test.ts.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/prisma.server', () => ({ prisma: {} }));
vi.mock('@/lib/rmhark-ai/generate.server', () => ({
  isRmharkAIConfigured: vi.fn(() => true),
  generateBotProfile: vi.fn(),
  generatePost: vi.fn(),
  generateReactionPost: vi.fn(),
  generateReply: vi.fn(),
  generateDirectMessageReply: vi.fn(),
  generateDirectMessageOpener: vi.fn(),
}));
vi.mock('@/lib/rmhark-ai/image.server', () => ({
  isImageGenConfigured: vi.fn(() => false),
  generatePostImage: vi.fn(),
}));
// The default announcement source (Agent D's module) is only reached through `liveAnnouncement`.
const { currentMock } = vi.hoisted(() => ({ currentMock: vi.fn() }));
vi.mock('@/lib/sitewide-announcement.server', () => ({ getCurrentAnnouncement: currentMock }));

import { mulberry32 } from '@/lib/core/rng';
import { loadBotConfig } from '@/lib/rmhark-ai/bot-worker-config';
import {
  liveAnnouncement,
  loadReactionContext,
  pickHeadline,
  postAsBot,
  reactToComments,
  reactionKey,
  reactionPmf,
  resetBotWorkerState,
  runPostTick,
  runReplyTick,
  seedAnnouncementThread,
  withReactionLink,
  type BotAi,
  type BotDeps,
  type BotRepo,
  type BotThreadComment,
  type BotUserRow,
  type CommentRow,
  type LiveAnnouncement,
  type ReactionContext,
} from '@/lib/rmhark-ai/bot-worker.server';
import { postKindPmf, type Headline } from '@/lib/rmhark-ai/reaction-model';

const HOUR = 3_600_000;
const NOW = Date.UTC(2026, 10, 13, 12, 0, 0);
const silent = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

type Over = Partial<Omit<BotDeps, 'repo' | 'ai'>> & {
  repo?: Partial<BotRepo>;
  ai?: Partial<BotAi>;
};

function deps(over: Over = {}): BotDeps {
  const { repo, ai, ...rest } = over;
  return {
    repo: { loadSettings: async () => null, touchBot: async () => {}, ...repo } as BotRepo,
    ai: { imageConfigured: () => false, image: async () => null, ...ai } as BotAi,
    notify: { messageDelivered: vi.fn(async () => {}), typing: vi.fn(async () => {}) },
    cfg: loadBotConfig({}),
    log: silent,
    now: () => NOW,
    random: () => 0,
    ...rest,
  };
}

/** Feeds `values` in order, then `rest` forever. */
function seq(values: number[], rest = 0.99): () => number {
  let i = 0;
  return () => (i < values.length ? (values[i++] ?? rest) : rest);
}

const ANN: LiveAnnouncement = {
  id: 'blog1',
  title: 'The arcade has a new room',
  description: 'Four new games are live.',
  slug: 'new-arcade-room',
  business: 'rmh-studios',
  announcedAt: NOW - HOUR,
  discussionPostId: 'post-ann',
};

const headline = (key: string, ageH: number): Headline => ({
  key,
  title: `Headline ${key}`,
  summary: `Summary ${key}`,
  source: 'Example News',
  url: `https://news.example/${key}`,
  publishedAt: NOW - ageH * HOUR,
});

const bot = (id: string): BotUserRow => ({
  id,
  botPersona: `THEME: ${id}.\nACTIVITY: very online, posts frequently with quick thoughts.`,
  botLastPostAt: null,
});

function ctx(over: Partial<ReactionContext> = {}): ReactionContext {
  const announcement = over.announcement === undefined ? ANN : over.announcement;
  return {
    now: NOW,
    announcement,
    announcementAgeH: announcement ? (NOW - announcement.announcedAt) / HOUR : null,
    headlines: [],
    headlineReactions: new Map(),
    reacted: new Set(),
    ...over,
  };
}

/** A repo + AI that record what the post path did. */
function postRecorder() {
  const inserted: { userId: string; content: string; imageUrls: string[] }[] = [];
  const recorded: { botId: string; kind: string; refKey: string; postId: string | null }[] = [];
  let n = 0;
  const repo: Partial<BotRepo> = {
    insertPost: async (userId, content, imageUrls) => {
      inserted.push({ userId, content, imageUrls });
      return `p${++n}`;
    },
    recordReaction: async (r) => {
      recorded.push(r);
      return true;
    },
  };
  const reactionPost = vi.fn<BotAi['reactionPost']>(async (o) => `take on ${o.title}`);
  const post = vi.fn(async () => 'usual post');
  return { inserted, recorded, repo, ai: { reactionPost, post }, reactionPost, post };
}

beforeEach(() => resetBotWorkerState());
afterEach(() => vi.restoreAllMocks());

// ─── kind choice ────────────────────────────────────────────────────────────

describe('reactionPmf', () => {
  it('is postKindPmf when the bot can use every kind', () => {
    const c = ctx({ headlines: [headline('a', 1)] });
    expect(reactionPmf(c, 'b1')).toEqual(postKindPmf({ announcementAgeH: 1, headlineCount: 1 }));
  });

  it('an announcement the bot already reacted to falls through to news/usual, re-normalised', () => {
    const c = ctx({ headlines: [headline('a', 1)] });
    c.reacted.add(reactionKey('b1', 'announcement', ANN.id));
    const base = postKindPmf({ announcementAgeH: 1, headlineCount: 1 });
    const p = reactionPmf(c, 'b1');
    expect(p.announcement).toBe(0);
    expect(p.news).toBeCloseTo(base.news / (base.news + base.usual), 12);
    expect(p.news + p.usual).toBeCloseTo(1, 12);
    // Another bot is unaffected.
    expect(reactionPmf(c, 'b2').announcement).toBeCloseTo(base.announcement, 12);
  });

  it('with every headline covered and the announcement done, only the usual post is left', () => {
    const c = ctx({ headlines: [headline('a', 1)] });
    c.reacted.add(reactionKey('b1', 'announcement', ANN.id));
    c.reacted.add(reactionKey('b1', 'news', 'a'));
    expect(reactionPmf(c, 'b1')).toEqual({ announcement: 0, news: 0, usual: 1 });
  });
});

describe('postAsBot with a reaction context', () => {
  // Announcement 1h old, one headline: announcement ~0.473, news ~0.158, usual ~0.369.
  it('the injected draw picks the kind: announcement, with the blog link when drawn', async () => {
    const r = postRecorder();
    const d = deps({ random: seq([0.1, 0.2]), repo: r.repo, ai: r.ai });
    await postAsBot(d, bot('b1'), ctx({ headlines: [headline('a', 1)] }));
    expect(r.reactionPost).toHaveBeenCalledWith({
      persona: bot('b1').botPersona,
      kind: 'announcement',
      title: ANN.title,
      summary: ANN.description,
      source: 'RMH Studios',
    });
    expect(r.post).not.toHaveBeenCalled();
    expect(r.inserted).toEqual([
      {
        userId: 'b1',
        content: `take on ${ANN.title}\nhttps://rmhstudios.com/blog/new-arcade-room`,
        imageUrls: [],
      },
    ]);
    expect(r.recorded).toEqual([
      { botId: 'b1', kind: 'announcement', refKey: 'blog1', postId: 'p1' },
    ]);
    expect(silent.info).toHaveBeenCalledWith(
      'bot_worker.reaction_posted',
      expect.objectContaining({ kind: 'announcement', refKey: 'blog1' }),
    );
  });

  it('no link when the link draw says so', async () => {
    const r = postRecorder();
    const d = deps({ random: seq([0.1, 0.7]), repo: r.repo, ai: r.ai });
    await postAsBot(d, bot('b1'), ctx());
    expect(r.inserted[0]?.content).toBe(`take on ${ANN.title}`);
  });

  it('news: a headline, its own url as the link, recorded under its key', async () => {
    const r = postRecorder();
    const d = deps({ random: seq([0.55, 0, 0.1]), repo: r.repo, ai: r.ai });
    await postAsBot(d, bot('b1'), ctx({ headlines: [headline('a', 1)] }));
    expect(r.reactionPost).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'news', title: 'Headline a', source: 'Example News' }),
    );
    expect(r.inserted[0]?.content).toBe('take on Headline a\nhttps://news.example/a');
    expect(r.recorded).toEqual([{ botId: 'b1', kind: 'news', refKey: 'a', postId: 'p1' }]);
  });

  it('usual: today\'s post, with the image draw still applying', async () => {
    const r = postRecorder();
    const d = deps({
      random: seq([0.95, 0]),
      repo: r.repo,
      ai: { ...r.ai, imageConfigured: () => true, image: async () => '/img.jpg' },
    });
    await postAsBot(d, bot('b1'), ctx({ headlines: [headline('a', 1)] }));
    expect(r.reactionPost).not.toHaveBeenCalled();
    expect(r.inserted).toEqual([{ userId: 'b1', content: 'usual post', imageUrls: ['/img.jpg'] }]);
    expect(r.recorded).toEqual([]);
  });

  it('reaction posts never get an image', async () => {
    const r = postRecorder();
    const image = vi.fn(async () => '/img.jpg');
    const d = deps({
      random: () => 0,
      repo: r.repo,
      ai: { ...r.ai, imageConfigured: () => true, image },
    });
    await postAsBot(d, bot('b1'), ctx());
    expect(image).not.toHaveBeenCalled();
    expect(r.inserted[0]?.imageUrls).toEqual([]);
  });

  it('a bot that already reacted to the announcement is not skipped: the same draw lands on news', async () => {
    const r = postRecorder();
    const c = ctx({ headlines: [headline('a', 1)] });
    c.reacted.add(reactionKey('b1', 'announcement', ANN.id));
    const d = deps({ random: seq([0.1, 0, 0.9]), repo: r.repo, ai: r.ai });
    await postAsBot(d, bot('b1'), c);
    expect(r.recorded).toEqual([{ botId: 'b1', kind: 'news', refKey: 'a', postId: 'p1' }]);
  });

  it('two bots in one tick spread across headlines', async () => {
    const r = postRecorder();
    // No announcement: news is [0, 0.3). Kind draws 0.1; pick draws 0.5; then link draws.
    const c = ctx({ announcement: null, headlines: [headline('fresh', 0), headline('older', 5)] });
    const d = deps({ random: seq([0.1, 0.5, 0.1, 0.5, 0.9, 0.9]), repo: r.repo, ai: r.ai });
    await Promise.all([postAsBot(d, bot('b1'), c), postAsBot(d, bot('b2'), c)]);
    expect(r.recorded.map((x) => x.refKey).sort()).toEqual(['fresh', 'older']);
    expect(c.headlineReactions.get('fresh')).toBe(1);
    expect(c.headlineReactions.get('older')).toBe(1);
  });

  it('without the in-tick count the second bot would have doubled up (control)', () => {
    const c = ctx({ announcement: null, headlines: [headline('fresh', 0), headline('older', 5)] });
    expect(pickHeadline(c, 'b2', 0.5)?.key).toBe('fresh');
    c.headlineReactions.set('fresh', 1);
    expect(pickHeadline(c, 'b2', 0.5)?.key).toBe('older');
  });

  it('a failed or empty generation posts nothing, never throws, and releases its claim', async () => {
    for (const reactionPost of [
      async () => '   ',
      async (): Promise<string> => Promise.reject(new Error('deepseek down')),
    ]) {
      const r = postRecorder();
      const c = ctx({ announcement: null, headlines: [headline('a', 1)] });
      const d = deps({ random: () => 0, repo: r.repo, ai: { ...r.ai, reactionPost } });
      await expect(postAsBot(d, bot('b1'), c)).resolves.toBeUndefined();
      expect(r.inserted).toEqual([]);
      expect(c.reacted.size).toBe(0);
      expect(c.headlineReactions.get('a')).toBe(0);
    }
  });

  it('a unique-key conflict is "already reacted": logged, not thrown', async () => {
    const r = postRecorder();
    const d = deps({
      random: () => 0,
      repo: { ...r.repo, recordReaction: async () => false },
      ai: r.ai,
    });
    await postAsBot(d, bot('b1'), ctx());
    expect(silent.warn).toHaveBeenCalledWith(
      'bot_worker.reaction_duplicate',
      expect.objectContaining({ refKey: 'blog1' }),
    );
  });
});

describe('withReactionLink', () => {
  it('appends on its own line and keeps the whole within the RMHark limit', () => {
    expect(withReactionLink('hi', 'https://x.example/a', true)).toBe('hi\nhttps://x.example/a');
    expect(withReactionLink('hi', 'https://x.example/a', false)).toBe('hi');
    const long = 'word '.repeat(60).trim();
    const out = withReactionLink(long, 'https://x.example/a', true);
    expect(out.length).toBeLessThanOrEqual(280);
    expect(out.endsWith('\nhttps://x.example/a')).toBe(true);
  });
  it('drops a link that is not http(s) or would leave the text no room', () => {
    expect(withReactionLink('hi', 'javascript:alert(1)', true)).toBe('hi');
    expect(withReactionLink('hi', `https://x.example/${'a'.repeat(260)}`, true)).toBe('hi');
  });
});

// ─── the post tick ──────────────────────────────────────────────────────────

describe('runPostTick with reactions', () => {
  const bots = [bot('b1'), bot('b2'), bot('b3')];

  it('loads the announcement, headlines and reaction counts ONCE per tick; one reaction per bot', async () => {
    const r = postRecorder();
    const headlines = vi.fn(async () => [headline('a', 1)]);
    const announcement = vi.fn(async () => ANN);
    const reactionCounts = vi.fn(async () => new Map<string, number>());
    // b2 already reacted to the announcement: it falls through to the headline.
    const reactionsBy = vi.fn(async () => [
      { botId: 'b2', kind: 'announcement' as const, refKey: 'blog1' },
    ]);
    const d = deps({
      random: () => 0,
      headlines,
      announcement,
      repo: { ...r.repo, loadBots: async () => bots, reactionCounts, reactionsBy },
      ai: r.ai,
    });
    expect(await runPostTick(d)).toBe(3);
    expect(headlines).toHaveBeenCalledTimes(1);
    expect(announcement).toHaveBeenCalledTimes(1);
    expect(reactionCounts).toHaveBeenCalledTimes(1);
    expect(reactionCounts).toHaveBeenCalledWith('news', ['a']);
    expect(reactionsBy).toHaveBeenCalledTimes(1);
    const firstCall: readonly unknown[] | undefined = reactionsBy.mock.calls[0];
    expect(firstCall?.[0]).toHaveLength(3);
    const byBot = Object.fromEntries(r.recorded.map((x) => [x.botId, `${x.kind}:${x.refKey}`]));
    expect(byBot).toEqual({ b1: 'announcement:blog1', b2: 'news:a', b3: 'announcement:blog1' });
  });

  it('paused (multiplier 0): no reaction posts and no sources read', async () => {
    const headlines = vi.fn(async () => [headline('a', 1)]);
    const announcement = vi.fn(async () => ANN);
    const insertPost = vi.fn(async () => 'p');
    const d = deps({
      headlines,
      announcement,
      repo: {
        loadSettings: async () => ({
          targetBotCount: 20,
          createBatch: 6,
          createIntervalMin: 120,
          postRateMultiplier: 0,
          maxPostsPerTick: 5,
          updatedAt: new Date(NOW),
        }),
        loadBots: async () => bots,
        insertPost,
      },
    });
    expect(await runPostTick(d)).toBe(0);
    expect(headlines).not.toHaveBeenCalled();
    expect(announcement).not.toHaveBeenCalled();
    expect(insertPost).not.toHaveBeenCalled();
  });

  it('BOT_REACTIONS_ENABLED=false: bots post as usual and nothing is read', async () => {
    const r = postRecorder();
    const headlines = vi.fn(async () => [headline('a', 1)]);
    const d = deps({
      cfg: loadBotConfig({ BOT_REACTIONS_ENABLED: 'false' }),
      random: () => 0,
      headlines,
      announcement: async () => ANN,
      repo: { ...r.repo, loadBots: async () => bots },
      ai: r.ai,
    });
    await runPostTick(d);
    expect(headlines).not.toHaveBeenCalled();
    expect(r.reactionPost).not.toHaveBeenCalled();
    expect(r.post).toHaveBeenCalledTimes(3);
  });

  it('when the reaction tables cannot be read, the tick still posts as usual', async () => {
    const r = postRecorder();
    const d = deps({
      random: () => 0,
      headlines: async () => [headline('a', 1)],
      announcement: async () => ANN,
      repo: {
        ...r.repo,
        loadBots: async () => bots,
        reactionCounts: async () => Promise.reject(new Error('db down')),
        reactionsBy: async () => [],
      },
      ai: r.ai,
    });
    expect(await runPostTick(d)).toBe(3);
    expect(r.post).toHaveBeenCalledTimes(3);
    expect(r.reactionPost).not.toHaveBeenCalled();
  });

  it('loadReactionContext drops stale headlines and survives failing sources', async () => {
    const d = deps({
      headlines: async () => [headline('new', 1), headline('stale', 40)],
      announcement: async () => Promise.reject(new Error('cache down')),
      repo: { reactionCounts: async () => new Map([['new', 2]]), reactionsBy: async () => [] },
    });
    const c = await loadReactionContext(d, ['b1']);
    expect(c?.announcement).toBeNull();
    expect(c?.announcementAgeH).toBeNull();
    expect(c?.headlines.map((h) => h.key)).toEqual(['new']);
    expect(c?.headlineReactions.get('new')).toBe(2);
  });
});

// ─── the announcement thread ────────────────────────────────────────────────

describe('seedAnnouncementThread', () => {
  const comment = (id: string, userId: string, minutesAgo: number): BotThreadComment => ({
    id,
    userId,
    parentId: null,
    createdAt: new Date(NOW - minutesAgo * 60_000),
  });

  function setup(
    o: {
      comments?: BotThreadComment[];
      bots?: string[];
      random?: () => number;
      announcement?: LiveAnnouncement | null;
      multiplier?: number;
      post?: { content: string; quotedContent: string } | null;
    } = {},
  ) {
    const insertComment = vi.fn(
      async (_r: string, _u: string, _c: string, _p: string | null) => {},
    );
    const reply = vi.fn<BotAi['reply']>(async () => 'my two cents');
    const botCommentsOnPost = vi.fn(async () => o.comments ?? []);
    const d = deps({
      random: o.random ?? (() => 0),
      announcement: async () => (o.announcement === undefined ? ANN : o.announcement),
      repo: {
        loadSettings: async () => ({
          targetBotCount: 20,
          createBatch: 6,
          createIntervalMin: 120,
          postRateMultiplier: o.multiplier ?? 1,
          maxPostsPerTick: 5,
          updatedAt: new Date(NOW),
        }),
        botCommentsOnPost,
        postForReply: async () =>
          o.post === undefined ? { content: 'RMH Studios announcement: …', quotedContent: '' } : o.post,
        botsExcept: async () => (o.bots ?? ['b1', 'b2', 'b3']).map(bot),
        commentAlreadyAnswered: async () => false,
        buildReplyContext: async () => ({
          postContent: 'RMH Studios announcement: …',
          quotedPostContent: '',
          thread: ['first!'],
        }),
        botPersona: async (id) => `THEME: ${id}.`,
        insertComment,
      },
      ai: { reply },
    });
    return { d, insertComment, reply, botCommentsOnPost };
  }

  // 1h old, 5-minute reply tick: lambda = (0.4 + 7e^(-1/6)) / 12 ~ 0.527, so e^-lambda ~ 0.590.
  // Draws of 0.99 keep the Poisson product above that; a 0.01 ends it.
  const poisson = (n: number) => [...Array<number>(n).fill(0.99), 0.01];

  it('the expected number of comments follows the rate, scaled by the multiplier', async () => {
    for (const [multiplier, expected] of [
      [1, 0.527],
      [2, 1.054],
    ] as const) {
      const rnd = mulberry32(42 + multiplier);
      let total = 0;
      const N = 3000;
      for (let i = 0; i < N; i++) {
        const { d, insertComment } = setup({ random: rnd, multiplier, bots: ['b1', 'b2', 'b3', 'b4'] });
        await seedAnnouncementThread(d);
        total += insertComment.mock.calls.length;
      }
      expect(Math.abs(total / N - expected)).toBeLessThan(0.06 * multiplier);
    }
  });

  it('a top-level comment on the discussion post when no other bot has commented', async () => {
    const { d, insertComment, reply } = setup({ random: seq([...poisson(1), 0]) });
    expect(await seedAnnouncementThread(d)).toBe(1);
    expect(insertComment).toHaveBeenCalledWith('post-ann', 'b1', 'my two cents', null);
    expect(reply).toHaveBeenCalledWith(
      expect.objectContaining({ postContent: 'RMH Studios announcement: …', thread: [] }),
    );
  });

  it('threaded: answers another bot\'s comment (the newest when the draw is 0) with the real thread', async () => {
    const { d, insertComment, reply } = setup({
      comments: [comment('old', 'b1', 50), comment('new', 'b3', 5)],
      // n=1; pick b2 (index 1 of 3); threaded (0.1 < 0.45); target draw 0 = newest.
      random: seq([...poisson(1), 0.4, 0.1, 0]),
    });
    expect(await seedAnnouncementThread(d)).toBe(1);
    expect(insertComment).toHaveBeenCalledWith('post-ann', 'b2', 'my two cents', 'new');
    expect(reply).toHaveBeenCalledWith(expect.objectContaining({ thread: ['first!'] }));
  });

  it('top-level instead when the thread draw is above THREAD_REPLY_PROB', async () => {
    const { d, insertComment } = setup({
      comments: [comment('c1', 'b1', 5)],
      random: seq([...poisson(1), 0.4, 0.6]),
    });
    await seedAnnouncementThread(d);
    expect(insertComment).toHaveBeenCalledWith('post-ann', 'b2', 'my two cents', null);
  });

  it('never replies to its own comment', async () => {
    // Only b1 exists and only b1 has commented: nobody else to answer, so top-level only.
    const solo = setup({ bots: ['b1'], comments: [comment('c1', 'b1', 5)], random: () => 0 });
    await seedAnnouncementThread(solo.d);
    for (const call of solo.insertComment.mock.calls) expect(call[3]).toBeNull();

    // Many seeded runs with several authors: a threaded comment never answers its own author.
    const comments = [comment('x1', 'b1', 30), comment('x2', 'b2', 20), comment('x3', 'b3', 10)];
    const author = new Map(comments.map((c) => [c.id, c.userId]));
    const rnd = mulberry32(5);
    let threaded = 0;
    for (let i = 0; i < 400; i++) {
      const { d, insertComment } = setup({ comments, random: rnd, multiplier: 10 });
      await seedAnnouncementThread(d);
      for (const [, userId, , parentId] of insertComment.mock.calls) {
        if (parentId === null) continue;
        threaded++;
        expect(author.get(parentId)).not.toBe(userId);
      }
    }
    expect(threaded).toBeGreaterThan(0);
  });

  it('caps: one bot says at most 2 per thread; nothing past 40 bot comments', async () => {
    // b1 already has 2; only b2 can speak, and only twice, however many the draw asks for.
    const capped = setup({
      bots: ['b1', 'b2'],
      comments: [comment('c1', 'b1', 9), comment('c2', 'b1', 8)],
      random: seq([...poisson(5)], 0.9),
    });
    expect(await seedAnnouncementThread(capped.d)).toBe(2);
    expect(capped.insertComment.mock.calls.every((c) => c[1] === 'b2')).toBe(true);

    const full = Array.from({ length: 40 }, (_, i) => comment(`c${i}`, `x${i % 20}`, i));
    const atCap = setup({ comments: full, random: seq(poisson(5)) });
    expect(await seedAnnouncementThread(atCap.d)).toBe(0);
    expect(atCap.insertComment).not.toHaveBeenCalled();

    const nearCap = setup({ comments: full.slice(0, 39), random: seq(poisson(5), 0.9) });
    expect(await seedAnnouncementThread(nearCap.d)).toBe(1);
  });

  it('nothing without an announcement, a discussion post, inside the window, or when paused/off', async () => {
    const cases = [
      setup({ announcement: null }),
      setup({ announcement: { ...ANN, discussionPostId: null } }),
      setup({ announcement: { ...ANN, announcedAt: NOW - 73 * HOUR } }),
      setup({ multiplier: 0 }),
    ];
    for (const { d, insertComment, botCommentsOnPost } of cases) {
      d.random = seq(poisson(5));
      expect(await seedAnnouncementThread(d)).toBe(0);
      expect(insertComment).not.toHaveBeenCalled();
      expect(botCommentsOnPost).not.toHaveBeenCalled();
    }
    const off = setup({ random: seq(poisson(5)) });
    off.d.cfg = loadBotConfig({ BOT_REACTIONS_ENABLED: 'off' });
    expect(await seedAnnouncementThread(off.d)).toBe(0);

    const deleted = setup({ post: null, random: seq(poisson(5)) });
    expect(await seedAnnouncementThread(deleted.d)).toBe(0);
    expect(deleted.insertComment).not.toHaveBeenCalled();
  });

  it('a failing comment is isolated and the reply tick never throws', async () => {
    const { d, insertComment } = setup({ random: seq([...poisson(2)], 0.9) });
    insertComment.mockRejectedValueOnce(new Error('db down'));
    expect(await seedAnnouncementThread(d)).toBe(1);

    const broken = setup();
    broken.d.repo.botCommentsOnPost = async () => Promise.reject(new Error('db down'));
    broken.d.repo.recentComments = async () => [];
    broken.d.repo.recentBotPosts = async () => [];
    broken.d.random = seq(poisson(3));
    await expect(runReplyTick(broken.d)).resolves.toBeUndefined();
  });
});

// ─── bot-to-bot exchanges continue through reactToComments ──────────────────

describe('reactToComments under the announcement post', () => {
  const row = (over: Partial<CommentRow>): CommentRow => ({
    id: 'r1',
    userId: 'b2',
    parentId: 'c1',
    rmheetId: 'post-ann',
    authorIsBot: true,
    // The announcement post's author is a human admin.
    postUserId: 'admin',
    postDeletedAt: null,
    postUserIsBot: false,
    parentUserId: 'b1',
    parentUserIsBot: true,
    ...over,
  });

  function setup(comments: CommentRow[]) {
    const insertComment = vi.fn(async () => {});
    const d = deps({
      cfg: { ...loadBotConfig({}), botToBotProb: 1, reactiveHumanProb: 1 },
      repo: {
        recentComments: async () => comments,
        commentAlreadyAnswered: async () => false,
        buildReplyContext: async () => ({ postContent: 'ann', quotedPostContent: '', thread: ['a', 'b'] }),
        botPersona: async () => 'THEME: x.',
        insertComment,
      },
      ai: { reply: async () => 'fair point' },
    });
    return { d, insertComment };
  }

  it('a bot answering a bot comment under a human post is answered by that bot', async () => {
    const { d, insertComment } = setup([row({})]);
    await reactToComments(d);
    expect(insertComment).toHaveBeenCalledWith('post-ann', 'b1', 'fair point', 'r1');
  });

  it('top-level comments on the human post, and replies to one\'s own comment, are not answered', async () => {
    const { d, insertComment } = setup([
      row({ id: 't1', parentId: null, parentUserId: null, parentUserIsBot: null }),
      row({ id: 's1', userId: 'b1', parentUserId: 'b1' }),
    ]);
    await reactToComments(d);
    expect(insertComment).not.toHaveBeenCalled();
  });
});

// ─── default sources ────────────────────────────────────────────────────────

describe('liveAnnouncement (default announcement source)', () => {
  it('adapts getCurrentAnnouncement and is null when there is none or it fails', async () => {
    currentMock.mockResolvedValueOnce({
      id: 'blog1',
      slug: 's',
      title: 't',
      description: 'd',
      image: null,
      business: 'rmh-capital',
      announcedAt: new Date(NOW).toISOString(),
      expiresAt: new Date(NOW + 30 * 24 * HOUR).toISOString(),
      discussionPostId: 'post-ann',
      content: 'body',
    });
    expect(await liveAnnouncement()).toEqual({
      id: 'blog1',
      title: 't',
      description: 'd',
      slug: 's',
      business: 'rmh-capital',
      announcedAt: NOW,
      discussionPostId: 'post-ann',
    });
    currentMock.mockResolvedValueOnce(null);
    expect(await liveAnnouncement()).toBeNull();
    currentMock.mockRejectedValueOnce(new Error('db down'));
    expect(await liveAnnouncement()).toBeNull();
  });
});
