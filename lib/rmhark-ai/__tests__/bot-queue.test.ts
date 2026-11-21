// The off-peak bot queue decides when DeepSeek is billed for bot posts and must never
// double-post or post while paused (docs/superpowers/specs/2026-11-20-bot-offpeak-queue-design.md).
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/prisma.server', () => ({
  prisma: {},
}));
vi.mock('@/lib/rmhark-ai/generate.server', () => ({
  isRmharkAIConfigured: () => true,
}));

import {
  postAsBot,
  resetBotWorkerState,
  runFillTick,
  type BotAi,
  type BotDeps,
  type BotRepo,
  type BotUserRow,
} from '@/lib/rmhark-ai/bot-worker.server';
import { loadBotConfig } from '@/lib/rmhark-ai/bot-worker-config';
import type { BotQueueRepo, ClaimedPost, QueuedPostInput } from '@/lib/rmhark-ai/bot-queue.server';
import { FILL_CAP, bufferTarget, commentDelayMs, commentMean, replyDelayMs } from '@/lib/rmhark-ai/bot-queue-plan';

const MIN = 60_000;
/** Tuesday 2026-11-10 12:00 UTC: off-peak. */
const OFF_PEAK = Date.UTC(2026, 10, 10, 12);
/** Tuesday 2026-11-10 07:00 UTC: inside the 06:00-10:00 peak window. */
const PEAK = Date.UTC(2026, 10, 10, 7);
const silent = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

/** An in-memory queue with the real repo's semantics (claim is atomic: it marks before any await). */
function memoryQueue() {
  const posts: (QueuedPostInput & {
    id: bigint;
    claimed: boolean;
    publishedPostId: string | null;
  })[] = [];
  let seq = 0n;
  const repo: BotQueueRepo = {
    async pendingCounts(now) {
      const m = new Map<string, number>();
      for (const p of posts) if (!p.claimed && p.expiresAt > now) m.set(p.botId, (m.get(p.botId) ?? 0) + 1);
      return m;
    },
    async deleteExpired(now) {
      const before = posts.length;
      for (let i = posts.length - 1; i >= 0; i--)
        if (!posts[i]!.claimed && posts[i]!.expiresAt <= now) posts.splice(i, 1);
      return before - posts.length;
    },
    async enqueue(p) {
      posts.push({
        ...p,
        id: ++seq,
        claimed: false,
        publishedPostId: null,
      });
    },
    claimNext(botId, now) {
      const p = posts.find((x) => x.botId === botId && !x.claimed && x.expiresAt > now);
      if (!p) return Promise.resolve(null);
      p.claimed = true;
      const out: ClaimedPost = {
        id: p.id,
        content: p.content,
        imagePrompt: p.imagePrompt,
        hasComments: p.comments.length > 0,
      };
      return Promise.resolve(out);
    },
    async unclaim(id) {
      const p = posts.find((x) => x.id === id);
      if (p && !p.publishedPostId) p.claimed = false;
    },
    async markPublished(id, postId) {
      const p = posts.find((x) => x.id === id);
      if (p) p.publishedPostId = postId;
    },
    dueComments: async () => [],
    publishComment: async () => 'c',
    discardSubtree: async () => {},
    humanRepliedTo: async () => false,
    scriptedPostIds: async () => new Set(),
  };
  return {
    repo,
    posts,
  };
}

function bot(id: string, activity = 'very online'): BotUserRow {
  return {
    id,
    botPersona: `ACTIVITY: ${activity}`,
    botLastPostAt: null,
  } as BotUserRow;
}

function deps(over: {
  now?: number;
  multiplier?: number;
  bots?: BotUserRow[];
  queue?: BotQueueRepo;
  ai?: Partial<BotAi>;
  repo?: Partial<BotRepo>;
}): BotDeps {
  return {
    repo: {
      loadSettings: async () => ({
        targetBotCount: 20,
        createBatch: 6,
        createIntervalMin: 120,
        postRateMultiplier: over.multiplier ?? 1,
        maxPostsPerTick: 5,
        updatedAt: null,
      }),
      loadBots: async () => over.bots ?? [],
      insertPost: vi.fn(async () => 'post-1'),
      touchBot: vi.fn(async () => {}),
      ...over.repo,
    } as unknown as BotRepo,
    ai: {
      post: vi.fn(async () => 'a queued thought'),
      reply: vi.fn(async () => 'a pre-written reply'),
      imageConfigured: () => false,
      image: async () => null,
      ...over.ai,
    } as unknown as BotAi,
    notify: {
      messageDelivered: vi.fn(async () => {}),
      typing: vi.fn(async () => {}),
    },
    cfg: loadBotConfig({}),
    log: silent,
    now: () => over.now ?? OFF_PEAK,
    random: () => 0.5,
    ...(over.queue
      ? {
          queue: over.queue,
        }
      : {}),
  };
}

beforeEach(() => resetBotWorkerState());

describe('queue sizing and pacing', () => {
  it('keeps about five hours of usual posts plus one spare', () => {
    expect(bufferTarget(10)).toBe(Math.ceil(((10 * 0.7) / 24) * 5) + 1);
    expect(bufferTarget(10)).toBe(3);
    expect(bufferTarget(0)).toBe(0);
  });

  it('spreads the live seeding rate over the hour’s bot posts, capped at 3', () => {
    // 0.4 per 5-minute tick = 4.8 seeds an hour, over 9.6 posts an hour = 0.5 a post.
    expect(commentMean(0.4, 1, 5 * MIN, 9.6)).toBeCloseTo(0.5);
    expect(commentMean(0.4, 1, 5 * MIN, 0.1)).toBe(3);
    expect(commentMean(0.4, 1, 5 * MIN, 0)).toBe(0);
  });

  it('draws comment delays of 5-180 minutes and reply delays of 2-60 minutes', () => {
    expect(commentDelayMs(0)).toBe(5 * MIN);
    expect(commentDelayMs(0.999999)).toBeLessThanOrEqual(180 * MIN);
    expect(replyDelayMs(0)).toBe(2 * MIN);
    expect(replyDelayMs(0.999999)).toBeLessThanOrEqual(60 * MIN);
  });
});

describe('runFillTick', () => {
  it('writes nothing during DeepSeek peak hours', async () => {
    const q = memoryQueue();
    const d = deps({
      now: PEAK,
      bots: [bot('b1')],
      queue: q.repo,
    });
    expect(await runFillTick(d)).toBe(0);
    expect(d.ai.post).not.toHaveBeenCalled();
  });

  it('writes nothing while posting is paused', async () => {
    const q = memoryQueue();
    const d = deps({
      multiplier: 0,
      bots: [bot('b1')],
      queue: q.repo,
    });
    expect(await runFillTick(d)).toBe(0);
    expect(d.ai.post).not.toHaveBeenCalled();
  });

  it('tops each bot up to its buffer target, counting what is already queued', async () => {
    const q = memoryQueue();
    await q.repo.enqueue({
      botId: 'b1',
      content: 'old',
      imagePrompt: null,
      expiresAt: new Date(OFF_PEAK + 60 * MIN),
      comments: [],
    });
    const d = deps({
      bots: [bot('b1'), bot('b2')],
      queue: q.repo,
    });
    // "very online" = 9 a day -> target 3: b1 needs 2 more, b2 needs 3.
    expect(await runFillTick(d)).toBe(5);
    expect(q.posts.filter((p) => p.botId === 'b1')).toHaveLength(3);
    expect(q.posts.filter((p) => p.botId === 'b2')).toHaveLength(3);
  });

  it('stops at the per-run cap of model calls', async () => {
    const q = memoryQueue();
    const bots = Array.from(
      {
        length: 40,
      },
      (_, i) => bot(`b${i}`),
    );
    const d = deps({
      bots,
      queue: q.repo,
    });
    expect(await runFillTick(d)).toBe(FILL_CAP);
    expect(d.ai.post).toHaveBeenCalledTimes(FILL_CAP);
  });
});

describe('postAsBot with a queue', () => {
  it('publishes the queued post without a model call', async () => {
    const q = memoryQueue();
    await q.repo.enqueue({
      botId: 'b1',
      content: 'written last night',
      imagePrompt: null,
      expiresAt: new Date(OFF_PEAK + 60 * MIN),
      comments: [],
    });
    const d = deps({
      now: PEAK,
      queue: q.repo,
    });
    await postAsBot(d, bot('b1'));
    expect(d.ai.post).not.toHaveBeenCalled();
    expect(d.repo.insertPost).toHaveBeenCalledWith('b1', 'written last night', []);
    expect(q.posts[0]!.publishedPostId).toBe('post-1');
  });

  it('falls back to live generation when the bot has nothing queued', async () => {
    const q = memoryQueue();
    const d = deps({
      now: PEAK,
      queue: q.repo,
    });
    await postAsBot(d, bot('b1'));
    expect(d.ai.post).toHaveBeenCalledOnce();
    expect(d.repo.insertPost).toHaveBeenCalledWith('b1', 'a queued thought', []);
  });

  it('never publishes one queued post twice when two ticks overlap', async () => {
    const q = memoryQueue();
    await q.repo.enqueue({
      botId: 'b1',
      content: 'only once',
      imagePrompt: null,
      expiresAt: new Date(OFF_PEAK + 60 * MIN),
      comments: [],
    });
    const insertPost = vi.fn(async () => 'post-x');
    const d = deps({
      queue: q.repo,
      ai: {
        post: vi.fn(async () => 'live'),
      },
      repo: {
        insertPost,
      },
    });
    await Promise.all([postAsBot(d, bot('b1')), postAsBot(d, bot('b1'))]);
    const contents = insertPost.mock.calls.map((c) => (c as unknown as [string, string])[1]);
    expect(contents.filter((c) => c === 'only once')).toHaveLength(1);
    expect(contents).toContain('live');
  });

  it('hands the post back when publishing fails', async () => {
    const q = memoryQueue();
    await q.repo.enqueue({
      botId: 'b1',
      content: 'retry me',
      imagePrompt: null,
      expiresAt: new Date(OFF_PEAK + 60 * MIN),
      comments: [],
    });
    const d = deps({
      queue: q.repo,
      repo: {
        insertPost: vi.fn(async () => {
          throw new Error('db down');
        }),
      },
    });
    await postAsBot(d, bot('b1'));
    expect(q.posts[0]!.claimed).toBe(false);
  });

  it('makes the picture from the stored prompt at publish time', async () => {
    const q = memoryQueue();
    await q.repo.enqueue({
      botId: 'b1',
      content: 'sunset',
      imagePrompt: 'a red sky',
      expiresAt: new Date(OFF_PEAK + 60 * MIN),
      comments: [],
    });
    const image = vi.fn(async () => 'https://img/1.png');
    const d = deps({
      queue: q.repo,
      ai: {
        imageConfigured: () => true,
        image,
      },
    });
    await postAsBot(d, bot('b1'));
    expect(image).toHaveBeenCalledWith('sunset', 'b1', 'a red sky');
    expect(d.repo.insertPost).toHaveBeenCalledWith('b1', 'sunset', ['https://img/1.png']);
  });
});
