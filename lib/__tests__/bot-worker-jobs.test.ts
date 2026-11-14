import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/prisma.server', () => ({ prisma: {} }));
vi.mock('@/lib/rmhark-ai/generate.server', () => ({
  isRmharkAIConfigured: vi.fn(() => true),
  generateBotProfile: vi.fn(),
  generatePost: vi.fn(),
  generateReply: vi.fn(),
  generateDirectMessageReply: vi.fn(),
  generateDirectMessageOpener: vi.fn(),
}));
vi.mock('@/lib/rmhark-ai/image.server', () => ({
  isImageGenConfigured: vi.fn(() => false),
  generatePostImage: vi.fn(),
}));

import { HANDLE_REGEX, RESERVED_HANDLES } from '@/lib/handle';
import {
  BOT_QUEUES,
  answerDirectMessages,
  forEachLimited,
  internalApiBase,
  maintainBotPool,
  reactToComments,
  registerBotWorkerJobs,
  resetBotWorkerState,
  runMaintainTick,
  runPostTick,
  seedBotConversation,
  uniqueHandle,
  type BotAi,
  type BotDeps,
  type BotRepo,
  type CommentRow,
} from '@/lib/rmhark-ai/bot-worker.server';
import * as generate from '@/lib/rmhark-ai/generate.server';
import {
  clampSettings,
  cronForInterval,
  effectiveTickMs,
  loadBotConfig,
  maintenanceDue,
  orderPair,
  sanitizeHandle,
  scaledCount,
  shouldPost,
} from '@/lib/rmhark-ai/bot-worker-config';
import { composePersona, rollPersona, withPoliticalLean, POSTING_HABITS } from '@/lib/rmhark-ai/persona';
import { habitPostsPerDay } from '@/lib/rmhark-ai/bot-stats';

const MIN = 60_000;
const silent = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

type Over = Partial<Omit<BotDeps, 'repo' | 'ai'>> & {
  repo?: Partial<BotRepo>;
  ai?: Partial<BotAi>;
};

function deps(over: Over = {}): BotDeps {
  const { repo, ai, ...rest } = over;
  return {
    repo: { ...repo } as BotRepo,
    ai: { imageConfigured: () => false, image: async () => null, ...ai } as BotAi,
    notify: { messageDelivered: vi.fn(async () => {}), typing: vi.fn(async () => {}) },
    cfg: loadBotConfig({}),
    log: silent,
    now: () => Date.UTC(2026, 10, 10, 12, 0, 0),
    random: () => 0,
    ...rest,
  };
}

const SETTINGS = {
  targetBotCount: 20,
  createBatch: 6,
  createIntervalMin: 120,
  postRateMultiplier: 1,
  maxPostsPerTick: 5,
};

beforeEach(() => resetBotWorkerState());
afterEach(() => vi.restoreAllMocks());

// ─── settings.go ────────────────────────────────────────────────────────────

describe('settings and config (Go settings_test.go)', () => {
  it('clamps every admin knob into its bounds', () => {
    expect(
      clampSettings({
        targetBotCount: -5,
        createBatch: 0,
        createIntervalMin: 1,
        postRateMultiplier: 99,
        maxPostsPerTick: 0,
      }),
    ).toEqual({
      targetBotCount: 0,
      createBatch: 1,
      createIntervalMin: 5,
      postRateMultiplier: 10,
      maxPostsPerTick: 1,
    });
    expect(
      clampSettings({
        targetBotCount: 1e6,
        createBatch: 1e6,
        createIntervalMin: 1e9,
        postRateMultiplier: Number.NaN,
        maxPostsPerTick: 1e6,
      }),
    ).toEqual({
      targetBotCount: 1000,
      createBatch: 50,
      createIntervalMin: 1440,
      postRateMultiplier: 0,
      maxPostsPerTick: 60,
    });
  });

  it('empty env gives the built-in defaults; overrides apply and clamp', () => {
    const d = loadBotConfig({});
    expect(d.defaults).toEqual(SETTINGS);
    expect(d.postTickMs).toBe(5 * MIN);
    expect(d.imageProb).toBe(0.05);
    expect(d.model).toBe('deepseek-flash');

    const o = loadBotConfig({
      BOT_TARGET_COUNT: '75',
      BOT_POST_TICK_MS: '120000',
      BOT_POST_RATE_MULTIPLIER: '2.5',
      BOT_IMAGE_PROBABILITY: '7',
      BOT_AI_MODEL: 'm',
    });
    expect(o.defaults.targetBotCount).toBe(75);
    expect(o.defaults.postRateMultiplier).toBe(2.5);
    expect(o.postTickMs).toBe(2 * MIN);
    expect(o.imageProb).toBe(1);
    expect(o.model).toBe('m');
    // The reply tick follows the post tick unless set on its own.
    expect(o.replyTickMs).toBe(2 * MIN);
    expect(loadBotConfig({ BOT_POST_TICK_MS: '0' }).postTickMs).toBe(5 * MIN);
    expect(loadBotConfig({ BOT_GEN_CONCURRENCY: '99' }).genConcurrency).toBe(16);
  });

  it('maintenanceDue: first pass, interval, fresh admin save', () => {
    const now = Date.UTC(2026, 10, 10);
    const s = { createIntervalMin: 60, updatedAt: new Date(now - 120 * MIN) };
    expect(maintenanceDue(now, null, null, s)).toBe(true);
    expect(maintenanceDue(now, now - 10 * MIN, s.updatedAt.getTime(), s)).toBe(false);
    expect(maintenanceDue(now, now - 61 * MIN, s.updatedAt.getTime(), s)).toBe(true);
    const saved = { ...s, updatedAt: new Date(now - MIN) };
    expect(maintenanceDue(now, now - 10 * MIN, s.updatedAt.getTime(), saved)).toBe(true);
  });

  it('scaledCount', () => {
    const cases: [number, number, number][] = [
      [0, 0, 0],
      [0.4, 0.39, 1],
      [0.4, 0.41, 0],
      [2.5, 0.49, 3],
      [2.5, 0.51, 2],
      [3, 0.99, 3],
    ];
    for (const [expected, rnd, want] of cases) expect(scaledCount(expected, rnd)).toBe(want);
  });

  it('pg-boss cron for a tick interval (minute granularity)', () => {
    expect(cronForInterval(5 * MIN)).toBe('*/5 * * * *');
    expect(cronForInterval(20_000)).toBe('* * * * *');
    expect(cronForInterval(MIN)).toBe('* * * * *');
    expect(cronForInterval(120 * MIN)).toBe('0 */2 * * *');
    expect(cronForInterval(60 * MIN)).toBe('0 * * * *');
    expect(cronForInterval(48 * 60 * MIN)).toBe('0 0 * * *');
    expect(effectiveTickMs(20_000)).toBe(MIN);
    expect(effectiveTickMs(5 * MIN)).toBe(5 * MIN);
  });
});

// ─── worker.go ──────────────────────────────────────────────────────────────

describe('pacing (Go worker_test.go, repo_test.go)', () => {
  it('persona never reveals a bot, and every habit drives its rate', () => {
    for (let i = 0; i < 200; i++) {
      const got = composePersona(rollPersona()).toLowerCase();
      for (const banned of ['as an ai', 'i am a bot', 'language model', 'chatbot']) {
        expect(got).not.toContain(banned);
      }
    }
    for (const h of POSTING_HABITS) {
      const spec = { ...rollPersona(), habit: h };
      expect(habitPostsPerDay(composePersona(spec))).toBe(h.postsPerDay);
    }
  });

  it('only the ACTIVITY line sets the pace', () => {
    const persona =
      'VOICE (x): posts frequently with flair\nACTIVITY: rare poster — only chimes in when something matters.';
    expect(habitPostsPerDay(persona)).toBe(2);
    expect(habitPostsPerDay('very online')).toBe(9);
  });

  it('the multiplier scales the per-tick probability; 0 pauses', () => {
    const now = Date.now();
    const bot = {
      botPersona: 'ACTIVITY: posts a few times a day about their day and interests.',
      botLastPostAt: null,
    };
    // steady = 5/day over 288 five-minute ticks, p = 0.01736 at x1.
    expect(shouldPost(bot, 1, 5 * MIN, now, 0.017)).toBe(true);
    expect(shouldPost(bot, 1, 5 * MIN, now, 0.018)).toBe(false);
    expect(shouldPost(bot, 3, 5 * MIN, now, 0.05)).toBe(true);
    expect(shouldPost(bot, 3, 5 * MIN, now, 0.053)).toBe(false);
    expect(shouldPost(bot, 0, 5 * MIN, now, 0)).toBe(false);
  });

  it('respects the minimum gap since the last post', () => {
    const now = Date.now();
    const bot = {
      botPersona: 'ACTIVITY: very online, frequently posts',
      botLastPostAt: new Date(now - 30_000),
    };
    expect(shouldPost(bot, 1, 5 * MIN, now, 0)).toBe(false);
  });

  it('forEachLimited bounds concurrency', async () => {
    let inFlight = 0;
    let peak = 0;
    let calls = 0;
    await forEachLimited(20, 3, async () => {
      peak = Math.max(peak, ++inFlight);
      await new Promise((r) => setTimeout(r, 2));
      inFlight--;
      calls++;
    });
    expect(calls).toBe(20);
    expect(peak).toBeLessThanOrEqual(3);
  });
});

describe('handles (Go repo_test.go golden values)', () => {
  it('sanitizeHandle', () => {
    const cases: [string, string][] = [
      ['HelloWorld', 'helloworld'],
      ['john_doe_123', 'johndoe123'],
      ['ab', 'abuser'],
      ['verylonghandlethatexceedssixteen', 'verylonghandleth'],
      ['42coffee', 'u42coffee'],
      ['999', 'u999'],
      ['', 'uuser'],
      ['!!!', 'uuser'],
      ['admin', 'adminbot'],
      ['notifications', 'notificationsbot'],
    ];
    for (const [input, want] of cases) expect(sanitizeHandle(input)).toBe(want);
  });

  it('every sanitized handle satisfies the site rules and is not reserved', () => {
    const inputs = [
      'HelloWorld',
      '42coffee',
      '999',
      '',
      '!!!',
      'a',
      'ab',
      'admin',
      'API',
      '___',
      '-_-',
      'verylonghandlethatexceedssixteencharacters',
      'Ünïcödé',
      '日本語',
      '🎉',
      'notifications',
      'rmhstudios',
    ];
    for (const input of inputs) {
      const got = sanitizeHandle(input);
      expect(got).toMatch(HANDLE_REGEX);
      expect(RESERVED_HANDLES.has(got)).toBe(false);
    }
  });

  it('uniqueHandle retries with a numeric suffix', async () => {
    const taken = new Set(['coffeefan']);
    const d = deps({ repo: { handleExists: async (h: string) => taken.has(h) } });
    const h = await uniqueHandle(d, 'CoffeeFan');
    expect(h).toMatch(/^coffeefan\d{3,4}$/);
  });

  it('orderPair is canonical', () => {
    expect(orderPair('zeta', 'alpha')).toEqual(['alpha', 'zeta']);
    expect(orderPair('alpha', 'zeta')).toEqual(['alpha', 'zeta']);
  });
});

// ─── notify.go ──────────────────────────────────────────────────────────────

describe('internalApiBase (Go notify_test.go)', () => {
  it('prefers INTERNAL_API_URL, then the BETTER_AUTH_URL origin, then localhost', () => {
    expect(
      internalApiBase({
        INTERNAL_API_URL: 'https://internal.example.com/',
        BETTER_AUTH_URL: 'https://a.example.com',
      }),
    ).toBe('https://internal.example.com');
    expect(internalApiBase({ BETTER_AUTH_URL: 'https://auth.example.com/some/path' })).toBe(
      'https://auth.example.com',
    );
    expect(internalApiBase({})).toBe('http://127.0.0.1:7005');
  });
});

// ─── ticks ──────────────────────────────────────────────────────────────────

describe('pool maintenance', () => {
  it('mints min(batch, target - count) and none at target', async () => {
    const created: string[] = [];
    const base = {
      handleExists: async () => false,
      createBotUser: async (b: { handle: string }) => void created.push(b.handle),
    };
    const ai = { profile: async () => ({ name: 'Sam Lee', handle: 'samlee', bio: 'hi' }) };

    await maintainBotPool(deps({ repo: { ...base, countBots: async () => 20 }, ai }), SETTINGS);
    expect(created).toHaveLength(0);
    await maintainBotPool(deps({ repo: { ...base, countBots: async () => 0 }, ai }), SETTINGS);
    expect(created).toHaveLength(6);
    created.length = 0;
    await maintainBotPool(deps({ repo: { ...base, countBots: async () => 18 }, ai }), SETTINGS);
    expect(created).toHaveLength(2);
  });

  it('a failed profile mints no bot and does not throw', async () => {
    const create = vi.fn();
    await maintainBotPool(
      deps({
        repo: { countBots: async () => 0, handleExists: async () => false, createBotUser: create },
        ai: { profile: async () => Promise.reject(new Error('bad json')) },
      }),
      { ...SETTINGS, createBatch: 2 },
    );
    expect(create).not.toHaveBeenCalled();
  });

  it('runs on the first pass, then waits out the interval unless settings were saved', async () => {
    let now = Date.UTC(2026, 10, 10);
    let updatedAt: Date | null = null;
    const d = deps({
      now: () => now,
      repo: {
        loadSettings: async () => updatedAt && { ...SETTINGS, createIntervalMin: 60, updatedAt },
        countBots: async () => 20,
      },
    });
    expect(await runMaintainTick(d)).toBe(true);
    now += MIN;
    expect(await runMaintainTick(d)).toBe(false);
    updatedAt = new Date(now);
    expect(await runMaintainTick(d)).toBe(true);
    now += 30 * MIN;
    expect(await runMaintainTick(d)).toBe(false);
    now += 31 * MIN;
    expect(await runMaintainTick(d)).toBe(true);
  });
});

describe('post tick', () => {
  const bots = Array.from({ length: 30 }, (_, i) => ({
    id: `b${i}`,
    botPersona: 'ACTIVITY: very online, posts frequently with quick thoughts.',
    botLastPostAt: null,
  }));

  it('posts at most maxPostsPerTick, touches each bot, attaches an image when drawn', async () => {
    const inserted: { userId: string; imageUrls: string[] }[] = [];
    const touched: string[] = [];
    const d = deps({
      random: () => 0, // every bot is due; 0 < imageProb draws an image
      repo: {
        loadSettings: async () => null,
        loadBots: async () => bots,
        insertPost: async (userId: string, _c: string, imageUrls: string[]) => {
          inserted.push({ userId, imageUrls });
          return 'p';
        },
        touchBot: async (id: string) => void touched.push(id),
      },
      ai: {
        post: async () => 'hello feed',
        imageConfigured: () => true,
        image: async () => '/api/feed/image/x.jpg',
      },
    });
    expect(await runPostTick(d)).toBe(5);
    expect(inserted).toHaveLength(5);
    expect(touched).toHaveLength(5);
    expect(inserted.every((p) => p.imageUrls[0] === '/api/feed/image/x.jpg')).toBe(true);
  });

  it('an image failure falls back to text-only; an empty post is dropped; a failed generation is isolated', async () => {
    const inserted: string[][] = [];
    let n = 0;
    const d = deps({
      repo: {
        loadSettings: async () => null,
        loadBots: async () => bots.slice(0, 3),
        insertPost: async (_u: string, _c: string, imageUrls: string[]) => (
          inserted.push(imageUrls),
          'p'
        ),
        touchBot: async () => {},
      },
      ai: {
        post: async () => {
          n++;
          if (n === 1) return '   ';
          if (n === 2) throw new Error('deepseek down');
          return 'ok';
        },
        imageConfigured: () => true,
        image: async () => Promise.reject(new Error('xai down')),
      },
    });
    await runPostTick(d);
    expect(inserted).toEqual([[]]);
  });

  it('a multiplier of 0 pauses posting', async () => {
    const loadBots = vi.fn(async () => bots);
    const d = deps({
      repo: {
        loadSettings: async () => ({ ...SETTINGS, postRateMultiplier: 0, updatedAt: new Date() }),
        loadBots,
      },
    });
    expect(await runPostTick(d)).toBe(0);
    expect(loadBots).not.toHaveBeenCalled();
  });
});

describe('reply tick', () => {
  const row = (over: Partial<CommentRow>): CommentRow => ({
    id: 'c1',
    userId: 'human',
    parentId: null,
    rmheetId: 'p1',
    authorIsBot: false,
    postUserId: 'bot1',
    postDeletedAt: null,
    postUserIsBot: true,
    parentUserId: null,
    parentUserIsBot: null,
    ...over,
  });

  function setup(comments: CommentRow[], answered = false, thread: string[] = ['hi']) {
    const insertComment = vi.fn(async () => {});
    const d = deps({
      repo: {
        loadSettings: async () => null,
        recentComments: async () => comments,
        commentAlreadyAnswered: async () => answered,
        buildReplyContext: async () => ({ postContent: 'a post', quotedPostContent: '', thread }),
        botPersona: async () => 'THEME: x.',
        insertComment,
        touchBot: async () => {},
      },
      ai: { reply: async () => 'nice' },
    });
    return { d, insertComment };
  }

  it("answers a human's top-level comment on a bot post, as the bot, as a reply to the comment", async () => {
    const { d, insertComment } = setup([row({})]);
    await reactToComments(d);
    expect(insertComment).toHaveBeenCalledWith('p1', 'bot1', 'nice', 'c1');
  });

  it('threaded replies target the parent comment author; non-bot targets, deleted posts and self replies are skipped', async () => {
    const { d, insertComment } = setup([
      row({ id: 'a', parentId: 'x', parentUserId: 'bot2', parentUserIsBot: true }),
      row({ id: 'b', postUserIsBot: false }),
      row({ id: 'c', postDeletedAt: new Date() }),
      row({ id: 'd', userId: 'bot1', authorIsBot: true }),
    ]);
    await reactToComments(d);
    expect(insertComment).toHaveBeenCalledTimes(1);
    expect(insertComment).toHaveBeenCalledWith('p1', 'bot2', 'nice', 'a');
  });

  it('never double-answers', async () => {
    const { d, insertComment } = setup([row({})], true);
    await reactToComments(d);
    expect(insertComment).not.toHaveBeenCalled();
  });

  it('stops at the reply depth cap', async () => {
    const { d, insertComment } = setup([row({})], false, Array(6).fill('x'));
    await reactToComments(d);
    expect(insertComment).not.toHaveBeenCalled();
  });

  it('proactive chatter: a bot that has not commented leaves a top-level comment', async () => {
    const insertComment = vi.fn(async () => {});
    const d = deps({
      random: () => 0,
      repo: {
        loadSettings: async () => null,
        recentBotPosts: async () => [
          { id: 'p9', content: 'bot post', userId: 'bot1', quotedContent: '' },
        ],
        commentersOnPost: async () => new Set(['bot2']),
        botsExcept: async () => [
          { id: 'bot2', botPersona: 'a', botLastPostAt: null },
          { id: 'bot3', botPersona: 'b', botLastPostAt: null },
        ],
        insertComment,
        touchBot: async () => {},
      },
      ai: { reply: async () => 'agreed' },
    });
    await seedBotConversation(d);
    expect(insertComment).toHaveBeenCalledWith('p9', 'bot3', 'agreed', null);
  });
});

describe('dm tick', () => {
  it('the candidate scan is ONE query however many conversations there are', async () => {
    let queries = 0;
    const convos = Array.from({ length: 60 }, () => ({
      id: 'c',
      participantOneId: 'bot',
      participantTwoId: 'human',
      oneIsBot: true,
      twoIsBot: false,
      lastSenderId: 'human',
    }));
    const d = deps({
      cfg: { ...loadBotConfig({}), reactiveDmProb: 0 }, // find candidates, answer none
      random: () => 0.5,
      repo: { recentBotConversations: async () => (queries++, convos) },
    });
    await answerDirectMessages(d);
    expect(queries).toBe(1);
  });

  it('answers when the human spoke last, with typing before and after, history oldest first', async () => {
    const typing = vi.fn(async () => {});
    const delivered = vi.fn(async () => {});
    const dmReply = vi.fn(async () => 'hey there');
    const d = deps({
      repo: {
        recentBotConversations: async () => [
          {
            id: 'c1',
            participantOneId: 'human',
            participantTwoId: 'bot',
            oneIsBot: false,
            twoIsBot: true,
            lastSenderId: 'human',
          },
          {
            id: 'c2',
            participantOneId: 'h2',
            participantTwoId: 'bot',
            oneIsBot: false,
            twoIsBot: true,
            lastSenderId: 'bot',
          },
          {
            id: 'c3',
            participantOneId: 'b1',
            participantTwoId: 'b2',
            oneIsBot: true,
            twoIsBot: true,
            lastSenderId: 'b1',
          },
        ],
        botPersona: async () => 'THEME: x.',
        recentDmHistory: async () => [
          { senderId: 'human', content: 'second' },
          { senderId: 'bot', content: 'first' },
        ],
        sendBotDm: async (conversationId: string, botId: string, content: string) => ({
          id: 'm1',
          conversationId,
          senderId: botId,
          content,
          read: false,
          createdAt: 'x',
        }),
      },
      ai: { dmReply },
      notify: { typing, messageDelivered: delivered },
    });
    await answerDirectMessages(d);
    expect(dmReply).toHaveBeenCalledTimes(1);
    expect(dmReply).toHaveBeenCalledWith(withPoliticalLean('THEME: x.', 'bot'), [
      { from: 'you', text: 'first' },
      { from: 'them', text: 'second' },
    ]);
    expect(typing.mock.calls.map((c) => (c as unknown[])[1])).toEqual([
      { conversationId: 'c1', senderId: 'bot', isTyping: true },
      { conversationId: 'c1', senderId: 'bot', isTyping: false },
    ]);
    expect(delivered).toHaveBeenCalledTimes(1);
  });
});

// ─── registration ───────────────────────────────────────────────────────────

describe('registerBotWorkerJobs', () => {
  function fakeBoss() {
    return {
      createQueue: vi.fn(async (_n: string, _o?: object) => {}),
      schedule: vi.fn(async (_n: string, _c: string, _d: object, _o: object) => {}),
      unschedule: vi.fn(async (_n: string) => {}),
      work: vi.fn(async (_n: string, _h: () => Promise<void>) => {}),
      send: vi.fn(async (_n: string, _d: object) => {}),
    };
  }

  it('idles without DEEPSEEK_API_KEY: nothing is scheduled or worked, old schedules are removed', async () => {
    vi.mocked(generate.isRmharkAIConfigured).mockReturnValue(false);
    const boss = fakeBoss();
    await registerBotWorkerJobs(boss);
    expect(boss.schedule).not.toHaveBeenCalled();
    expect(boss.work).not.toHaveBeenCalled();
    expect(boss.unschedule.mock.calls.map((c) => c[0])).toEqual([...BOT_QUEUES]);
    vi.mocked(generate.isRmharkAIConfigured).mockReturnValue(true);
  });

  it('with a key: four exclusive queues, crons from the tick env, a boot top-up', async () => {
    const boss = fakeBoss();
    await registerBotWorkerJobs(boss, {
      cfg: loadBotConfig({ BOT_POST_TICK_MS: '600000' }),
      log: silent,
    });
    const crons = Object.fromEntries(boss.schedule.mock.calls.map((c) => [c[0], c[1]]));
    expect(crons).toEqual({
      'bot-worker.maintain': '* * * * *',
      'bot-worker.post': '*/10 * * * *',
      'bot-worker.reply': '*/10 * * * *',
      'bot-worker.dm': '* * * * *',
    });
    expect(boss.createQueue).toHaveBeenCalledWith(
      'bot-worker.post',
      expect.objectContaining({ policy: 'exclusive', retryLimit: 0 }),
    );
    expect(boss.work).toHaveBeenCalledTimes(4);
    expect(boss.send).toHaveBeenCalledWith('bot-worker.maintain', {});
  });
});
