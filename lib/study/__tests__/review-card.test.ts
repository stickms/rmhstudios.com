/**
 * `reviewCard` (s12-12) is the one grading path of the site's review route and the developer API: the same grade on
 * the same state gives the same schedule and the same history row through either; the quest and XP step runs only
 * when asked for; a card that is not reviewed, not in the stated deck or not readable is `not_found`; and the site
 * route still answers as it always did.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handlersOf } from '@/lib/__tests__/api-handlers-of';
import { nextState } from '@/lib/rmhstudy/srs';

const h = vi.hoisted(() => ({
  card: null as null | {
    id: string;
    deckId: string;
    kind: string;
    sourceId: string | null;
    deck: { isPublic: boolean; userId: string };
  },
  review: null as null | { easeFactor: number; intervalDays: number; repetitions: number },
  editor: null as null | { status: string },
  saveReview: vi.fn(async (_input: unknown) => ({ leech: false })),
  recordStudyReview: vi.fn(async (_userId: string) => undefined),
  getSession: vi.fn(),
}));

vi.mock('@/lib/prisma.server', () => ({
  prisma: {
    flashcard: { findUnique: vi.fn(async () => h.card) },
    flashcardReview: { findUnique: vi.fn(async () => h.review) },
    deckEditor: { findUnique: vi.fn(async () => h.editor) },
    userBlock: { findFirst: vi.fn(async () => null) },
    user: { findUnique: vi.fn(async () => ({ bannedUntil: null })) },
    flashcardDeck: { findUnique: vi.fn(async () => ({ userId: h.card?.deck.userId ?? 'x' })) },
  },
}));
vi.mock('@/lib/study/review-log.server', () => ({ saveReview: h.saveReview }));
vi.mock('@/lib/quests/engine.server', () => ({ recordStudyReview: h.recordStudyReview }));
vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: h.getSession } } }));
vi.mock('@/lib/rate-limit.server', async (orig) => ({
  ...(await orig<typeof import('@/lib/rate-limit.server')>()),
  checkRateLimit: vi.fn(async () => ({ allowed: true })),
}));

const { reviewCard } = await import('@/lib/study/review.server');
const { route } = await import('@/lib/study/api/study.cards.$id.review.server');

const NOW = new Date('2026-11-25T12:00:00Z');
const own = (over: Record<string, unknown> = {}) => ({
  id: 'c1',
  deckId: 'd1',
  kind: 'basic',
  sourceId: null,
  deck: { isPublic: false, userId: 'me' },
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  h.card = own();
  h.review = null;
  h.editor = null;
  h.getSession.mockResolvedValue({ user: { id: 'me' }, session: { id: 's' } });
});

describe('reviewCard', () => {
  it('schedules a first review as the SM-2 state of a fresh card and writes the log row', async () => {
    const res = await reviewCard('me', 'c1', 2, { rewards: false });
    const expected = nextState({ easeFactor: 2.5, intervalDays: 0, repetitions: 0 }, 2);
    expect(res).toEqual({ ok: true, dueAt: expected.dueAt, intervalDays: 1, leech: false });
    expect(h.saveReview).toHaveBeenCalledWith({
      lapse: false,
      userId: 'me',
      cardId: 'c1',
      deckId: 'd1',
      grade: 2,
      next: expected,
    });
  });

  it('counts "again" on a learned card as a lapse, from the stored state', async () => {
    h.review = { easeFactor: 2.3, intervalDays: 6, repetitions: 2 };
    await reviewCard('me', 'c1', 0, { rewards: false });
    const call = h.saveReview.mock.calls[0]![0] as { lapse: boolean; next: unknown };
    expect(call.lapse).toBe(true);
    expect(call.next).toEqual(nextState(h.review, 0));
  });

  it('reports a leech the log decided', async () => {
    h.saveReview.mockResolvedValueOnce({ leech: true });
    expect(await reviewCard('me', 'c1', 0, { rewards: false })).toMatchObject({ ok: true, leech: true });
  });

  it('gives the same schedule and the same log row with and without rewards', async () => {
    h.review = { easeFactor: 2.5, intervalDays: 1, repetitions: 1 };
    const site = await reviewCard('me', 'c1', 3, { rewards: true });
    const api = await reviewCard('me', 'c1', 3, { rewards: false, deckId: 'd1' });
    expect(api).toEqual(site);
    expect(h.saveReview.mock.calls[1]![0]).toEqual(h.saveReview.mock.calls[0]![0]);
  });

  it('records the daily quest only for a site grade', async () => {
    await reviewCard('me', 'c1', 2, { rewards: true });
    expect(h.recordStudyReview).toHaveBeenCalledTimes(1);
    expect(h.recordStudyReview).toHaveBeenCalledWith('me');
    await reviewCard('me', 'c1', 2, { rewards: false });
    expect(h.recordStudyReview).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['a missing card', () => (h.card = null)],
    ['an authored cloze card', () => (h.card = own({ kind: 'cloze' }))],
    ['an authored occlusion card', () => (h.card = own({ kind: 'occlusion' }))],
    ['a private deck of another member', () => (h.card = own({ deck: { isPublic: false, userId: 'other' } }))],
  ])('refuses %s as not found and writes nothing', async (_name, arrange) => {
    arrange();
    expect(await reviewCard('me', 'c1', 2, { rewards: true })).toEqual({ ok: false, reason: 'not_found' });
    expect(h.saveReview).not.toHaveBeenCalled();
    expect(h.recordStudyReview).not.toHaveBeenCalled();
  });

  it('grades a card of a public deck and a generated sibling', async () => {
    h.card = own({ kind: 'cloze', sourceId: 'src', deck: { isPublic: true, userId: 'other' } });
    expect(await reviewCard('me', 'c1', 1, { rewards: false })).toMatchObject({ ok: true });
  });

  it('lets an accepted editor grade on their own row, and refuses a pending invitee', async () => {
    h.card = own({ deck: { isPublic: false, userId: 'other' } });
    h.editor = { status: 'accepted' };
    expect(await reviewCard('me', 'c1', 2, { rewards: false })).toMatchObject({ ok: true });
    h.editor = { status: 'pending' };
    expect(await reviewCard('me', 'c1', 2, { rewards: false })).toEqual({ ok: false, reason: 'not_found' });
  });

  it('refuses a card that is not in the stated deck', async () => {
    expect(await reviewCard('me', 'c1', 2, { rewards: false, deckId: 'd2' })).toEqual({
      ok: false,
      reason: 'not_found',
    });
    expect(h.saveReview).not.toHaveBeenCalled();
  });
});

describe('the site route', () => {
  type Post = (a: { request: Request; params: Record<string, string> }) => Promise<Response>;
  const post = (grade: unknown) =>
    handlersOf<Post>(route).POST!({
      request: new Request('https://rmhstudios.com/api/study/cards/c1/review', {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: 'better-auth.session_token=abc' },
        body: JSON.stringify({ grade }),
      }),
      params: { id: 'c1' },
    });

  it('answers as before: success, the new schedule and the leech flag, and records the quest', async () => {
    const res = await post(2);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      success: true,
      dueAt: new Date(NOW.getTime() + 86_400_000).toISOString(),
      intervalDays: 1,
      leech: false,
    });
    expect(h.recordStudyReview).toHaveBeenCalledWith('me');
  });

  it('answers 404 "Not found" for a card it cannot grade, and 400 for a bad grade', async () => {
    h.card = null;
    const missing = await post(2);
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({ error: 'Not found' });
    const bad = await post(9);
    expect(bad.status).toBe(400);
    expect(await bad.json()).toEqual({ error: 'Invalid grade' });
  });
});
