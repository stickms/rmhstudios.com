// Pre-written bot conversations: what the off-peak fill writes with a queued post, how the reply
// tick releases it, and how live bot chatter steps aside for it
// (docs/superpowers/specs/2026-11-20-bot-offpeak-queue-design.md).
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/prisma.server', () => ({
  prisma: {},
}));
vi.mock('@/lib/rmhark-ai/generate.server', () => ({
  isRmharkAIConfigured: () => true,
}));

import {
  releaseQueuedComments,
  resetBotWorkerState,
  runFillTick,
  runReplyTick,
  seedBotConversation,
  type BotAi,
  type BotDeps,
  type BotRepo,
  type BotUserRow,
  type CommentRow,
} from '@/lib/rmhark-ai/bot-worker.server';
import { loadBotConfig, type BotConfig } from '@/lib/rmhark-ai/bot-worker-config';
import type { BotQueueRepo, DueComment, QueuedPostInput } from '@/lib/rmhark-ai/bot-queue.server';

const OFF_PEAK = Date.UTC(2026, 10, 10, 12); // Tuesday 12:00 UTC
const PEAK = Date.UTC(2026, 10, 10, 7); // Tuesday 07:00 UTC
const silent = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

function bot(id: string): BotUserRow {
  return {
    id,
    botPersona: `ACTIVITY: very online\nNAME: ${id}`,
    botLastPostAt: null,
  } as BotUserRow;
}

function queue(over: Partial<BotQueueRepo> = {}): BotQueueRepo & {
  enqueued: QueuedPostInput[];
} {
  const enqueued: QueuedPostInput[] = [];
  return {
    enqueued,
    pendingCounts: async () => new Map(),
    deleteExpired: async () => 0,
    enqueue: async (p) => void enqueued.push(p),
    claimNext: async () => null,
    unclaim: async () => {},
    markPublished: async () => {},
    dueComments: async () => [],
    publishComment: vi.fn(async () => 'c-new'),
    discardSubtree: vi.fn(async () => {}),
    humanRepliedTo: async () => false,
    scriptedPostIds: async () => new Set<string>(),
    ...over,
  };
}

function deps(over: {
  now?: number;
  multiplier?: number;
  cfg?: Partial<BotConfig>;
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
      loadBots: async () => [],
      recentComments: async () => [],
      recentBotPosts: async () => [],
      ...over.repo,
    } as unknown as BotRepo,
    ai: {
      post: vi.fn(async () => 'a post'),
      reply: vi.fn(async () => 'a reply'),
      imageConfigured: () => false,
      image: async () => null,
      ...over.ai,
    } as unknown as BotAi,
    notify: {
      messageDelivered: vi.fn(async () => {}),
      typing: vi.fn(async () => {}),
    },
    cfg: {
      ...loadBotConfig({}),
      ...over.cfg,
    },
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

describe('pre-written conversation at fill time', () => {
  it('writes a comment from another bot and an alternating reply chain up to the depth cap', async () => {
    const q = queue();
    const d = deps({
      queue: q,
      cfg: {
        botToBotProb: 1,
        maxReplyDepth: 3,
      },
      repo: {
        loadBots: async () => [bot('author'), bot('other')],
      },
    });
    await runFillTick(d);
    const post = q.enqueued.find((p) => p.botId === 'author')!;
    expect(post.comments).toHaveLength(1);
    const c = post.comments[0]!;
    expect(c.botId).toBe('other');
    expect(c.replies[0]!.botId).toBe('author');
    expect(c.replies[0]!.replies[0]!.botId).toBe('other');
    expect(c.replies[0]!.replies[0]!.replies).toEqual([]);
    // Each chain reply is written with the thread so far.
    const threads = (d.ai.reply as ReturnType<typeof vi.fn>).mock.calls.map(
      (call) =>
        (
          call[0] as {
            thread: string[];
          }
        ).thread.length,
    );
    expect(threads).toContain(2);
  });

  it('never has the author comment at top level on its own post', async () => {
    const q = queue();
    const d = deps({
      queue: q,
      cfg: {
        botToBotProb: 0,
      },
      repo: {
        loadBots: async () => [bot('a'), bot('b'), bot('c')],
      },
    });
    await runFillTick(d);
    for (const p of q.enqueued) for (const c of p.comments) expect(c.botId).not.toBe(p.botId);
  });

  it('drops only the subtree whose generation failed', async () => {
    const q = queue();
    let calls = 0;
    const reply = vi.fn(async () => {
      calls++;
      if (calls === 2) throw new Error('model down');
      return 'ok';
    });
    const d = deps({
      queue: q,
      cfg: {
        botToBotProb: 1,
        maxReplyDepth: 3,
      },
      ai: {
        reply,
      },
      repo: {
        loadBots: async () => [bot('author'), bot('other')],
      },
    });
    await runFillTick(d);
    const first = q.enqueued[0]!;
    expect(first.comments).toHaveLength(1);
    expect(first.comments[0]!.replies).toEqual([]);
  });
});

describe('releaseQueuedComments', () => {
  const top: DueComment = {
    id: 1n,
    botId: 'b',
    content: 'hi',
    postId: 'p1',
    parentCommentId: null,
    isReply: false,
  };
  const reply: DueComment = {
    id: 2n,
    botId: 'a',
    content: 'yo',
    postId: 'p1',
    parentCommentId: 'c1',
    isReply: true,
  };

  it('publishes due comments on a live post', async () => {
    const q = queue({
      dueComments: async () => [top],
    });
    const d = deps({
      queue: q,
      repo: {
        postForReply: async () => ({
          content: 'x',
          quotedContent: '',
        }),
      },
    });
    expect(await releaseQueuedComments(d)).toBe(1);
    expect(q.publishComment).toHaveBeenCalledWith(top, new Date(OFF_PEAK));
  });

  it('discards a comment whose post was deleted', async () => {
    const q = queue({
      dueComments: async () => [top],
    });
    const d = deps({
      queue: q,
      repo: {
        postForReply: async () => null,
      },
    });
    expect(await releaseQueuedComments(d)).toBe(0);
    expect(q.discardSubtree).toHaveBeenCalledWith(1n, new Date(OFF_PEAK));
    expect(q.publishComment).not.toHaveBeenCalled();
  });

  it('discards a scripted reply under a comment a human has answered', async () => {
    const q = queue({
      dueComments: async () => [reply],
      humanRepliedTo: async (id) => id === 'c1',
    });
    const d = deps({
      queue: q,
      repo: {
        postForReply: async () => ({
          content: 'x',
          quotedContent: '',
        }),
      },
    });
    expect(await releaseQueuedComments(d)).toBe(0);
    expect(q.discardSubtree).toHaveBeenCalledWith(2n, new Date(OFF_PEAK));
  });

  it('releases nothing while posting is paused', async () => {
    const due = vi.fn(async () => [top]);
    const q = queue({
      dueComments: due,
    });
    const d = deps({
      queue: q,
      multiplier: 0,
      repo: {
        postForReply: async () => ({
          content: 'x',
          quotedContent: '',
        }),
      },
    });
    expect(await releaseQueuedComments(d)).toBe(0);
    expect(due).not.toHaveBeenCalled();
  });
});

describe('live bot chatter around the queue', () => {
  function comment(id: string, authorIsBot: boolean): CommentRow {
    return {
      id,
      userId: authorIsBot ? 'other-bot' : 'human',
      parentId: null,
      rmheetId: 'p1',
      authorIsBot,
      postUserId: 'author',
      postDeletedAt: null,
      postUserIsBot: true,
      parentUserId: null,
      parentUserIsBot: null,
    };
  }

  function replyRepo(
    insertComment: BotRepo['insertComment'],
    recentBotPosts: BotRepo['recentBotPosts'] = async () => [],
  ): Partial<BotRepo> {
    return {
      recentComments: async () => [comment('from-human', false), comment('from-bot', true)],
      commentAlreadyAnswered: async () => false,
      buildReplyContext: async () => ({
        postContent: 'post',
        quotedPostContent: '',
        thread: ['c'],
      }),
      botPersona: async () => 'ACTIVITY: very online',
      insertComment,
      touchBot: async () => {},
      recentBotPosts,
    };
  }

  it('at peak, answers humans but skips bot-to-bot replies and proactive seeding', async () => {
    const insertComment = vi.fn<BotRepo['insertComment']>(async () => {});
    const recentBotPosts = vi.fn<BotRepo['recentBotPosts']>(async () => []);
    const d = deps({
      now: PEAK,
      queue: queue(),
      cfg: {
        botToBotProb: 1,
        reactiveHumanProb: 1,
      },
      repo: replyRepo(insertComment, recentBotPosts),
    });
    await runReplyTick(d);
    const answered = insertComment.mock.calls.map((c) => c[3]);
    expect(answered).toEqual(['from-human']);
    expect(recentBotPosts).not.toHaveBeenCalled();
  });

  it('off-peak, skips bot-to-bot replies on a scripted post but still answers the human there', async () => {
    const insertComment = vi.fn<BotRepo['insertComment']>(async () => {});
    const d = deps({
      queue: queue({
        scriptedPostIds: async () => new Set(['p1']),
      }),
      cfg: {
        botToBotProb: 1,
        reactiveHumanProb: 1,
      },
      repo: replyRepo(insertComment),
    });
    await runReplyTick(d);
    const answered = insertComment.mock.calls.map((c) => c[3]);
    expect(answered).toEqual(['from-human']);
  });

  it('does not seed live comments when every recent bot post is scripted', async () => {
    const reply = vi.fn(async () => 'x');
    const d = deps({
      queue: queue({
        scriptedPostIds: async () => new Set(['p1', 'p2']),
      }),
      cfg: {
        proactiveProb: 5,
      },
      ai: {
        reply,
      },
      repo: {
        recentBotPosts: async () => [
          {
            id: 'p1',
            content: 'a',
            userId: 'author',
            quotedContent: '',
          },
          {
            id: 'p2',
            content: 'b',
            userId: 'author',
            quotedContent: '',
          },
        ],
      },
    });
    await seedBotConversation(d);
    expect(reply).not.toHaveBeenCalled();
  });
});
