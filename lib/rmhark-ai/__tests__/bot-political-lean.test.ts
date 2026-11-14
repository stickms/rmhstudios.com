/**
 * Every persona the worker hands the AI carries a POLITICS line, even for a legacy bot whose
 * stored persona predates the axis. Repo and AI are fakes, as in bot-reactions.test.ts.
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
vi.mock('@/lib/sitewide-announcement.server', () => ({ getCurrentAnnouncement: vi.fn() }));

import { loadBotConfig } from '@/lib/rmhark-ai/bot-worker-config';
import {
  initiateDirectMessages,
  postAsBot,
  replyToComment,
  resetBotWorkerState,
  seedAnnouncementThread,
  seedOnPost,
  answerDirectMessages,
  type BotAi,
  type BotDeps,
  type BotRepo,
  type BotUserRow,
  type LiveAnnouncement,
  type ReactionContext,
} from '@/lib/rmhark-ai/bot-worker.server';
import { readPoliticalLean, withPoliticalLean } from '@/lib/rmhark-ai/persona';

const HOUR = 3_600_000;
const NOW = Date.UTC(2026, 10, 13, 12, 0, 0);
const silent = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
const LEGACY = 'THEME: vintage synths.\nACTIVITY: very online, posts frequently with quick thoughts.';

const legacyBot = (id: string): BotUserRow => ({ id, botPersona: LEGACY, botLastPostAt: null });

function deps(over: { repo?: Partial<BotRepo>; ai?: Partial<BotAi>; random?: () => number }): BotDeps {
  return {
    repo: { loadSettings: async () => null, touchBot: async () => {}, ...over.repo } as BotRepo,
    ai: { imageConfigured: () => false, image: async () => null, ...over.ai } as BotAi,
    notify: { messageDelivered: vi.fn(async () => {}), typing: vi.fn(async () => {}) },
    cfg: loadBotConfig({}),
    log: silent,
    now: () => NOW,
    random: over.random ?? (() => 0),
  };
}

const ANN: LiveAnnouncement = {
  id: 'blog1',
  title: 'New room',
  description: 'Four games.',
  slug: 'new-room',
  business: 'rmh-studios',
  announcedAt: NOW - HOUR,
  discussionPostId: 'post-ann',
};

function expectLean(persona: string | undefined, botId: string) {
  expect(persona).toBeDefined();
  expect(persona).toBe(withPoliticalLean(LEGACY, botId));
  expect(persona).toMatch(/^POLITICS \(/m);
  expect(readPoliticalLean(persona ?? '')).not.toBeNull();
}

beforeEach(() => {
  resetBotWorkerState();
  drawIndex = 0;
});
afterEach(() => vi.restoreAllMocks());

const poissonDraws = [0.99, 0.01];
let drawIndex = 0;
const poissonThenZero = () => poissonDraws[drawIndex++] ?? 0;

describe('the worker hands the AI a persona with a POLITICS line', () => {
  it('ordinary posts', async () => {
    const post = vi.fn(async (_p: string) => 'usual post');
    const d = deps({ repo: { insertPost: async () => 'p1' }, ai: { post } });
    await postAsBot(d, legacyBot('b1'));
    expectLean(post.mock.calls[0]?.[0], 'b1');
  });

  it('reaction posts', async () => {
    const reactionPost = vi.fn<BotAi['reactionPost']>(async () => 'take');
    const ctx: ReactionContext = {
      now: NOW,
      announcement: ANN,
      announcementAgeH: 1,
      headlines: [],
      headlineReactions: new Map(),
      reacted: new Set(),
    };
    const seq = [0.1, 0.2];
    let i = 0;
    const d = deps({
      random: () => seq[i++] ?? 0.99,
      repo: { insertPost: async () => 'p1', recordReaction: async () => true },
      ai: { reactionPost },
    });
    await postAsBot(d, legacyBot('b1'), ctx);
    expect(reactionPost).toHaveBeenCalledTimes(1);
    expectLean(reactionPost.mock.calls[0]?.[0].persona, 'b1');
  });

  it('replies (persona loaded from the repo)', async () => {
    const reply = vi.fn<BotAi['reply']>(async () => 'fair');
    const d = deps({
      repo: {
        buildReplyContext: async () => ({ postContent: 'p', quotedPostContent: '', thread: ['a'] }),
        botPersona: async () => LEGACY,
        insertComment: async () => {},
      },
      ai: { reply },
    });
    expect(await replyToComment(d, 'b2', 'c1', 'post1')).toBe(true);
    expectLean(reply.mock.calls[0]?.[0].persona, 'b2');
  });

  it('proactive comments', async () => {
    const reply = vi.fn<BotAi['reply']>(async () => 'hm');
    const d = deps({
      repo: {
        commentersOnPost: async () => new Set<string>(),
        botsExcept: async () => [legacyBot('b3')],
        insertComment: async () => {},
      },
      ai: { reply },
    });
    await seedOnPost(d, { id: 'post1', userId: 'b9', content: 'x', quotedContent: '' } as never);
    expectLean(reply.mock.calls[0]?.[0].persona, 'b3');
  });

  it('the announcement thread', async () => {
    const reply = vi.fn<BotAi['reply']>(async () => 'my take');
    const d = {
      ...deps({
        random: poissonThenZero,
        repo: {
          loadSettings: async () => ({
            targetBotCount: 20,
            createBatch: 6,
            createIntervalMin: 120,
            postRateMultiplier: 1,
            maxPostsPerTick: 5,
            updatedAt: new Date(NOW),
          }),
          botCommentsOnPost: async () => [],
          postForReply: async () => ({ content: 'ann', quotedContent: '' }),
          botsExcept: async () => [legacyBot('b4')],
          insertComment: async () => {},
        },
        ai: { reply },
      }),
      announcement: async () => ANN,
    } satisfies BotDeps;
    // Draws 0.99 then 0.01 make the Poisson count 1; later draws are 0.
    const made = await seedAnnouncementThread(d);
    expect(made).toBeGreaterThan(0);
    for (const call of reply.mock.calls) expectLean(call[0].persona, 'b4');
  });

  it('DM replies', async () => {
    const dmReply = vi.fn<BotAi['dmReply']>(async () => 'hello back');
    const d = deps({
      repo: {
        recentBotConversations: async () => [
          {
            id: 'conv1',
            participantOneId: 'h1',
            participantTwoId: 'b5',
            oneIsBot: false,
            twoIsBot: true,
            lastSenderId: 'h1',
          },
        ],
        botPersona: async () => LEGACY,
        recentDmHistory: async () => [{ senderId: 'h1', content: 'hi' }],
        sendBotDm: async (conversationId: string, botId: string, content: string) =>
          ({ id: 'm1', conversationId, senderId: botId, content, read: false, createdAt: 'x' }) as never,
      },
      ai: { dmReply },
    });
    await answerDirectMessages(d);
    expect(dmReply).toHaveBeenCalledTimes(1);
    expectLean(dmReply.mock.calls[0]?.[0], 'b5');
  });

  it('DM openers', async () => {
    const dmOpener = vi.fn<BotAi['dmOpener']>(async () => 'hey');
    const d = deps({
      repo: {
        recentActiveHumans: async () => ['h1'],
        botsExcept: async () => [legacyBot('b6')],
        dmPrivacy: async () => 'EVERYONE',
        followExists: async () => false,
        conversationOpenerMessages: async () => [],
        upsertConversation: async () => 'conv2',
        sendBotDm: async (conversationId: string, botId: string, content: string) =>
          ({ id: 'm2', conversationId, senderId: botId, content, read: false, createdAt: 'x' }) as never,
      } as Partial<BotRepo>,
      ai: { dmOpener },
    });
    await initiateDirectMessages(d);
    expect(dmOpener).toHaveBeenCalledTimes(1);
    expectLean(dmOpener.mock.calls[0]?.[0], 'b6');
  });
});
