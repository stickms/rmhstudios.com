/**
 * Quiz polls (sprint 07 #19): create validation, the reveal rule on every serialiser, final votes, the edit lock and
 * the live-event payload. Prisma is mocked; nothing here touches a database.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handlersOf } from '@/lib/__tests__/api-handlers-of';

const h = vi.hoisted(() => ({
  viewer: 'voter' as string,
  /** The quiz's stored poll row. */
  poll: null as null | Record<string, unknown>,
  priorVote: null as null | { id: string },
  published: [] as unknown[],
  pollUpdates: [] as unknown[],
}));

const prisma = vi.hoisted(() => ({
  rMHarkPollOption: { findUnique: vi.fn(), findMany: vi.fn(), updateMany: vi.fn(), update: vi.fn() },
  rMHarkPollVote: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
  },
  rMHarkPoll: { findUnique: vi.fn(), update: vi.fn(), create: vi.fn() },
  rMHark: { findUnique: vi.fn() },
  $transaction: vi.fn(),
}));

vi.mock('@/lib/prisma.server', () => ({ prisma }));
vi.mock('@/lib/db/advisory-lock.server', () => ({ lockKey: vi.fn(async () => undefined) }));
vi.mock('@/lib/notifications.server', () => ({ createNotification: vi.fn(async () => undefined) }));
vi.mock('@/lib/auth', () => ({
  auth: { api: { getSession: async () => ({ user: { id: h.viewer }, session: {} }) } },
}));
vi.mock('@/lib/rate-limit.server', () => ({
  withRateLimitAsync: async () => null,
  checkRateLimit: async () => ({ allowed: true, retryAfter: 0 }),
}));
vi.mock('@/lib/feed/audience.server', () => ({
  canReadPostThread: async () => true,
  canViewPost: async () => true,
  canReadThread: async () => true,
}));
vi.mock('@/lib/xp/engine.server', () => ({ awardXp: vi.fn() }));
vi.mock('@/lib/quests/engine.server', () => ({ progressQuests: vi.fn() }));
vi.mock('@/lib/feed-sse', () => ({
  feedEventBus: { publish: vi.fn(), publishPostEngagement: vi.fn(), publishCreatedPost: (e: unknown) => h.published.push(e) },
}));
vi.mock('@/lib/moderation.server', () => ({
  getHiddenAuthorIds: async () => [],
  getBlockedAuthorIds: async () => [],
}));
vi.mock('@/lib/communities/settings.server', () => ({ getCommunitySettings: async () => null }));
vi.mock('@/lib/admin-audit.server', () => ({ logAdminAction: vi.fn(), getActiveBan: async () => null }));
vi.mock('@/lib/tags-extract.server', () => ({ unlinkPostHashtags: vi.fn() }));
vi.mock('@/lib/feed/ranked-poll.server', () => ({ resolveEndedResult: async () => null }));
vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (config: unknown) => ({ options: config }),
}));

import { createRMHarkSchema, editRMHarkSchema } from '@/lib/rmhark-schema';
import { pollSchema as scheduledPollSchema } from '@/lib/scheduled/scheduled-schema';
import { mapRmharkToFeedItem } from '@/lib/feed/map-feed-item.server';
import { serializePostPoll } from '@/lib/api/serializers.server';
import { quizRevealFor, restampQuizReveal, stripQuizAnswer } from '@/lib/feed/quiz-poll';

const NOW = new Date('2026-11-27T12:00:00Z');
const PAST = new Date(NOW.getTime() - 60_000);
const FUTURE = new Date(NOW.getTime() + 86_400_000);

const quiz = (over: Record<string, unknown> = {}) => ({
  question: 'Capital of France?',
  options: ['Paris', 'Rome', 'Lyon'],
  quiz: true,
  correctIndex: 0,
  explanation: 'Paris has been the capital since 987.',
  ...over,
});

describe('create validation', () => {
  const parse = (poll: Record<string, unknown>) =>
    createRMHarkSchema.safeParse({ content: 'hi', poll });
  const messages = (poll: Record<string, unknown>) => {
    const r = parse(poll);
    return r.success ? [] : r.error.issues.map((i) => i.message);
  };

  it('takes a single-choice quiz with 2 to 4 options, one correct answer and an explanation', () => {
    expect(parse(quiz()).success).toBe(true);
    expect(parse(quiz({ options: ['a', 'b'], correctIndex: 1, explanation: undefined })).success).toBe(true);
    expect(parse(quiz({ options: ['a', 'b', 'c', 'd'], correctIndex: 3 })).success).toBe(true);
  });

  it('refuses a quiz that is multiple choice or ranked', () => {
    expect(messages(quiz({ multiSelect: true }))).toContain('A quiz cannot also be multiple choice');
    expect(messages(quiz({ ranked: true, durationHours: 24, options: ['a', 'b', 'c'] }))).toContain(
      'A quiz cannot also be ranked',
    );
  });

  it('refuses 5 options, no answer, an answer outside the options and a long explanation', () => {
    expect(parse(quiz({ options: ['a', 'b', 'c', 'd', 'e'] })).success).toBe(false);
    expect(messages(quiz({ correctIndex: undefined }))).toContain('A quiz needs one correct answer');
    expect(messages(quiz({ correctIndex: 3 }))).toContain('The correct answer must be one of the options');
    expect(parse(quiz({ explanation: 'x'.repeat(281) })).success).toBe(false);
  });

  it('refuses an answer or explanation on a poll that is not a quiz', () => {
    expect(messages({ question: 'q', options: ['a', 'b'], correctIndex: 0 })).toContain(
      'An answer or explanation needs the poll to be a quiz',
    );
  });

  it('applies the same rules to a scheduled post', () => {
    expect(scheduledPollSchema.safeParse(quiz()).success).toBe(true);
    expect(scheduledPollSchema.safeParse(quiz({ multiSelect: true })).success).toBe(false);
    expect(scheduledPollSchema.safeParse(quiz({ correctIndex: undefined })).success).toBe(false);
  });

  it('keeps plain polls unchanged', () => {
    expect(parse({ question: 'q', options: ['a', 'b'] }).success).toBe(true);
  });

  it('accepts quiz edits on the edit schema', () => {
    expect(editRMHarkSchema.safeParse({ content: 'x', quizCorrectOptionId: 'o1', quizExplanation: 'why' }).success).toBe(
      true,
    );
    expect(editRMHarkSchema.safeParse({ content: 'x', quizExplanation: 'x'.repeat(281) }).success).toBe(false);
  });
});

/** A post row as the feed query returns it, with a quiz poll. */
function row(opts: { viewerVoted?: boolean; closesAt?: Date | null; closedAt?: Date | null } = {}) {
  return {
    id: 'post1',
    userId: 'author',
    createdAt: NOW,
    content: 'Weekly trivia',
    user: { id: 'author', name: 'Author', handle: 'author', image: null },
    likeCount: 0,
    commentCount: 0,
    repostCount: 0,
    viewCount: 0,
    likes: [],
    reposts: [],
    reactions: [],
    poll: {
      id: 'poll1',
      question: 'Capital of France?',
      multiSelect: false,
      ranked: false,
      closesAt: opts.closesAt ?? null,
      closedAt: opts.closedAt ?? null,
      extendedAt: null,
      createdAt: NOW,
      correctOptionId: 'o1',
      explanation: 'Because.',
      options: [
        { id: 'o1', text: 'Paris', voteCount: 3, _count: { votes: 3 }, votes: [] },
        {
          id: 'o2',
          text: 'Rome',
          voteCount: 1,
          _count: { votes: 1 },
          votes: opts.viewerVoted ? [{ id: 'v', optionId: 'o2', rank: null }] : [],
        },
      ],
    },
  };
}

describe('the feed mapper (feed, tags, communities, explore, quotes, threads, search)', () => {
  beforeEach(() => vi.useFakeTimers({ now: NOW, toFake: ['Date'] }));

  it('hides the answer from a viewer who has not voted, and says it is a quiz', () => {
    const poll = mapRmharkToFeedItem(row(), 'reader').poll!;
    expect(poll.quiz).toBe(true);
    expect(poll).not.toHaveProperty('correctOptionId');
    expect(poll).not.toHaveProperty('explanation');
    expect(JSON.stringify(poll)).not.toContain('Because.');
  });

  it('hides it from a signed-out viewer', () => {
    const poll = mapRmharkToFeedItem(row(), null).poll!;
    expect(poll.quiz).toBe(true);
    expect(poll.correctOptionId).toBeUndefined();
  });

  it('shows it to a viewer who has voted', () => {
    const poll = mapRmharkToFeedItem(row({ viewerVoted: true }), 'reader').poll!;
    expect(poll.correctOptionId).toBe('o1');
    expect(poll.explanation).toBe('Because.');
    expect(poll.myVotes).toEqual(['o2']);
  });

  it('shows it to the author without a vote', () => {
    const poll = mapRmharkToFeedItem(row(), 'author').poll!;
    expect(poll.correctOptionId).toBe('o1');
  });

  it('shows it to everyone once the poll has ended, by the clock or by its author', () => {
    expect(mapRmharkToFeedItem(row({ closesAt: PAST }), 'reader').poll!.correctOptionId).toBe('o1');
    expect(mapRmharkToFeedItem(row({ closedAt: PAST }), null).poll!.correctOptionId).toBe('o1');
  });

  it('keeps it hidden while the poll is still open', () => {
    expect(mapRmharkToFeedItem(row({ closesAt: FUTURE }), 'reader').poll!.correctOptionId).toBeUndefined();
  });

  it('adds nothing to a plain poll', () => {
    const plain = row();
    plain.poll.correctOptionId = null as unknown as string;
    const poll = mapRmharkToFeedItem(plain, 'reader').poll!;
    expect(poll).not.toHaveProperty('quiz');
    expect(poll).not.toHaveProperty('correctOptionId');
  });
});

describe('a cached card is re-stamped per viewer', () => {
  const cached = {
    quiz: true as const,
    correctOptionId: 'o1',
    explanation: 'Because.',
    myVotes: [] as string[],
    ended: false,
  };

  it('drops an answer the viewer has not earned', () => {
    const out = restampQuizReveal(cached, 'someone-else', 'author');
    expect(out).not.toHaveProperty('correctOptionId');
    expect(out).not.toHaveProperty('explanation');
    expect(out.quiz).toBe(true);
    expect(restampQuizReveal(cached, null, 'author')).not.toHaveProperty('correctOptionId');
  });

  it('keeps it for the author, a voter and an ended poll', () => {
    expect(restampQuizReveal(cached, 'author', 'author').correctOptionId).toBe('o1');
    expect(restampQuizReveal({ ...cached, myVotes: ['o2'] }, 'reader', 'author').correctOptionId).toBe('o1');
    expect(restampQuizReveal({ ...cached, ended: true }, null, 'author').correctOptionId).toBe('o1');
  });

  it('strips unconditionally for a broadcast', () => {
    expect(stripQuizAnswer(cached)).not.toHaveProperty('correctOptionId');
    expect(stripQuizAnswer(cached)).not.toHaveProperty('explanation');
  });
});

describe('the developer API poll', () => {
  const apiPoll = { id: 'p', question: 'q', multiSelect: false, ranked: false, closesAt: null, closedAt: null, options: [] };
  const stored = { correctOptionId: 'o1', explanation: 'Because.', closesAt: null, closedAt: null };

  it('carries quiz: true and a null answer for a key owner who has not voted', () => {
    const out = serializePostPoll(apiPoll, null, false, quizRevealFor(stored, { viewerId: 'key-owner', authorId: 'author' }, false));
    expect(out).toMatchObject({ quiz: true, correctOptionId: null, explanation: null });
  });

  it('carries the answer for the author, a voter, and anyone after the end', () => {
    for (const [viewerId, voted, over] of [
      ['author', false, {}],
      ['key-owner', true, {}],
      ['key-owner', false, { closedAt: PAST }],
    ] as const) {
      const out = serializePostPoll(
        apiPoll,
        null,
        false,
        quizRevealFor({ ...stored, ...over }, { viewerId, authorId: 'author' }, voted),
      );
      expect(out).toMatchObject({ quiz: true, correctOptionId: 'o1', explanation: 'Because.' });
    }
  });

  it('says quiz: false for a plain poll', () => {
    expect(serializePostPoll(apiPoll, null, false)).toMatchObject({ quiz: false, correctOptionId: null, explanation: null });
  });
});

describe('voting on a quiz', () => {
  const optionRow = (over: Record<string, unknown> = {}) => ({
    id: 'o2',
    poll: {
      rmheetId: 'post1',
      multiSelect: false,
      ranked: false,
      id: 'poll1',
      closesAt: null,
      closedAt: null,
      correctOptionId: 'o1',
      explanation: 'Because.',
      ...over,
    },
  });
  const vote = async () => {
    const { route } = await import('@/lib/feed/api/rmharks.$id.vote.server');
    return handlersOf(route).POST!({
      params: { id: 'post1' },
      request: new Request('https://x.test/api/rmharks/post1/vote', {
        method: 'POST',
        headers: { cookie: 'better-auth.session_token=abc', 'content-type': 'application/json', 'cf-connecting-ip': '1.2.3.4' },
        body: JSON.stringify({ optionId: 'o2' }),
      }),
    });
  };

  beforeEach(() => {
    vi.clearAllMocks();
    h.viewer = 'voter';
    prisma.rMHarkPollOption.findUnique.mockResolvedValue(optionRow());
    prisma.rMHarkPollVote.findUnique.mockResolvedValue(null);
    prisma.rMHarkPollVote.findFirst.mockResolvedValue(null);
    prisma.rMHark.findUnique.mockResolvedValue({ userId: 'author' });
    prisma.rMHarkPollOption.findMany.mockResolvedValue([
      { id: 'o1', voteCount: 3 },
      { id: 'o2', voteCount: 2 },
    ]);
    prisma.rMHarkPollVote.findMany.mockResolvedValue([{ optionId: 'o2' }]);
    // The poll's times, re-read under its lock: open.
    prisma.rMHarkPoll.findUnique.mockResolvedValue({ closesAt: null, closedAt: null });
    prisma.$transaction.mockImplementation(async (fn: (t: unknown) => unknown) =>
      fn({ rMHarkPoll: prisma.rMHarkPoll, rMHarkPollOption: prisma.rMHarkPollOption, rMHarkPollVote: prisma.rMHarkPollVote }),
    );
  });

  it('answers with the reveal: the correct option and the explanation', async () => {
    const res = await vote();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      success: true,
      myVotes: ['o2'],
      quiz: true,
      correctOptionId: 'o1',
      explanation: 'Because.',
    });
    expect(prisma.rMHarkPollVote.create).toHaveBeenCalledTimes(1);
  });

  it('refuses a second answer with 409 ALREADY_ANSWERED and writes nothing', async () => {
    prisma.rMHarkPollVote.findFirst.mockResolvedValue({ id: 'earlier' });
    const res = await vote();
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: 'ALREADY_ANSWERED' });
    expect(prisma.rMHarkPollVote.create).not.toHaveBeenCalled();
    expect(prisma.rMHarkPollVote.deleteMany).not.toHaveBeenCalled();
  });

  it('refuses the author answering their own quiz with 403 OWN_QUIZ', async () => {
    prisma.rMHark.findUnique.mockResolvedValue({ userId: 'voter' });
    const res = await vote();
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: 'OWN_QUIZ' });
    expect(prisma.rMHarkPollVote.create).not.toHaveBeenCalled();
  });

  it('refuses taking the vote back (an un-vote is a retract)', async () => {
    prisma.rMHarkPollVote.findUnique.mockResolvedValue({ id: 'v1' });
    prisma.rMHarkPollVote.findFirst.mockResolvedValue({ id: 'v1' });
    const res = await vote();
    expect(res.status).toBe(409);
    expect(prisma.rMHarkPollVote.delete).not.toHaveBeenCalled();
  });

  it('refuses a racing second answer under the poll lock', async () => {
    // The early check sees nothing; the check under the lock finds the other request's vote.
    prisma.rMHarkPollVote.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'racer' });
    const res = await vote();
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: 'ALREADY_ANSWERED' });
    expect(prisma.rMHarkPollVote.create).not.toHaveBeenCalled();
  });

  it('leaves a plain poll alone: no reveal fields, un-voting still works', async () => {
    prisma.rMHarkPollOption.findUnique.mockResolvedValue(optionRow({ correctOptionId: null, explanation: null }));
    prisma.rMHarkPollVote.findUnique.mockResolvedValue({ id: 'v1' });
    const res = await vote();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).not.toHaveProperty('quiz');
    expect(body).not.toHaveProperty('correctOptionId');
    expect(prisma.rMHarkPollVote.delete).toHaveBeenCalled();
  });
});

describe('editing a quiz after votes', () => {
  const edit = async (body: Record<string, unknown>) => {
    const { route } = await import('@/lib/feed/api/rmharks.$id.server');
    return handlersOf(route).PATCH!({
      params: { id: 'post1' },
      request: new Request('https://x.test/api/rmharks/post1', {
        method: 'PATCH',
        headers: { cookie: 'better-auth.session_token=abc', 'content-type': 'application/json', 'cf-connecting-ip': '1.2.3.4' },
        body: JSON.stringify(body),
      }),
    });
  };

  beforeEach(() => {
    vi.clearAllMocks();
    h.viewer = 'author';
    prisma.rMHark.findUnique.mockResolvedValue({
      userId: 'author',
      content: 'Weekly trivia',
      deletedAt: null,
      unlockPrice: null,
      gifUrl: null,
      gifAlt: null,
      isSensitive: false,
      contentWarning: null,
      communityId: null,
      imageAlts: [],
    });
    prisma.rMHarkPoll.findUnique.mockImplementation(async (args: { where: { rmheetId?: string } }) =>
      args.where.rmheetId
        ? { id: 'poll1', correctOptionId: 'o1' }
        : { options: [{ id: 'o1', voteCount: h.priorVote ? 1 : 0 }, { id: 'o2', voteCount: 0 }] },
    );
    prisma.rMHarkPollVote.findFirst.mockImplementation(async () => h.priorVote);
    prisma.$transaction.mockImplementation(async (fn: unknown) =>
      typeof fn === 'function'
        ? (fn as (t: unknown) => unknown)({ rMHarkPoll: prisma.rMHarkPoll, rMHarkPollVote: prisma.rMHarkPollVote })
        : fn,
    );
    h.priorVote = null;
  });

  it('changes the answer while nobody has voted', async () => {
    const res = await edit({ content: 'Weekly trivia', quizCorrectOptionId: 'o2', quizExplanation: 'Fixed.' });
    expect(res.status).toBe(200);
    expect(prisma.rMHarkPoll.update).toHaveBeenCalledWith({
      where: { id: 'poll1' },
      data: { correctOptionId: 'o2', explanation: 'Fixed.' },
    });
  });

  it('refuses with 409 QUIZ_LOCKED once any vote exists', async () => {
    h.priorVote = { id: 'v1' };
    const res = await edit({ content: 'Weekly trivia', quizCorrectOptionId: 'o2' });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: 'QUIZ_LOCKED' });
    expect(prisma.rMHarkPoll.update).not.toHaveBeenCalled();
  });

  it('refuses an answer that is not one of the options', async () => {
    const res = await edit({ content: 'Weekly trivia', quizCorrectOptionId: 'elsewhere' });
    expect(res.status).toBe(400);
    expect(prisma.rMHarkPoll.update).not.toHaveBeenCalled();
  });

  it('validates the post before it writes the answer: an empty edit changes nothing', async () => {
    const res = await edit({ content: '   ', quizCorrectOptionId: 'o2', quizExplanation: 'Fixed.' });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: 'Post cannot be empty' });
    expect(prisma.rMHarkPoll.update).not.toHaveBeenCalled();
  });
});

describe('the live-event payload of a new quiz', () => {
  it('has no answer in it', () => {
    const item = { id: 'p', poll: { id: 'x', quiz: true as const, correctOptionId: 'o1', explanation: 'Because.' } };
    const broadcast = { ...item, poll: stripQuizAnswer(item.poll) };
    expect(JSON.stringify(broadcast)).not.toContain('o1');
    expect(JSON.stringify(broadcast)).not.toContain('Because.');
  });
});
