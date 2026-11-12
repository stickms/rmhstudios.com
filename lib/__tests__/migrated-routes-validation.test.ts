/**
 * Routes that used to hand-parse their request body and were moved onto
 * `implement()` (redesign audit C1, batch 9). Each keeps its exact 400 text via
 * `defineHandler`'s `invalid` option; this table pins those texts so a later
 * "tidy" back to the generic `Invalid input` fails here instead of in a client
 * toast. (The rideshare routes have their own table in lib/rideshare/__tests__.)
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handlersOfModule } from '@/lib/__tests__/api-handlers-of';

const h = vi.hoisted(() => ({ getSession: vi.fn() }));

vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: h.getSession } } }));
vi.mock('@/lib/prisma.server', () => ({ prisma: {} }));
vi.mock('@/lib/homes/watches.server', () => ({
  listWatches: vi.fn(),
  createWatch: vi.fn(),
  setWatchActive: vi.fn(),
  deleteWatch: vi.fn(),
}));
vi.mock('@/lib/referrals.server', () => ({ claimReferral: vi.fn() }));
vi.mock('@/lib/social/reactions.server', () => ({ toggleCommentReaction: vi.fn() }));
vi.mock('@/lib/quests/engine.server', () => ({ recordStudyReview: vi.fn() }));
vi.mock('@/lib/game/submit.server', () => ({ submitGameScore: vi.fn() }));
vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (config: unknown) => ({ options: config }),
}));

type Handler = (a: { request: Request; params: Record<string, string> }) => Promise<Response>;

async function handler(mod: string, method: string): Promise<Handler> {
  return handlersOfModule<Handler>(await import(/* @vite-ignore */ mod))[method]!;
}

interface Case {
  name: string;
  mod: string;
  method: string;
  body?: unknown;
  url?: string;
  params?: Record<string, string>;
  error: string;
}

const CASES: Case[] = [
  {
    name: 'homes watch create: empty label',
    mod: '@/lib/homes/api/homes.watches.server',
    method: 'POST',
    body: { label: '' },
    error: 'Please check the watch details.',
  },
  {
    name: 'homes watch create: malformed JSON (was a 500)',
    mod: '@/lib/homes/api/homes.watches.server',
    method: 'POST',
    body: '{nope',
    error: 'Please check the watch details.',
  },
  {
    name: 'homes watch toggle: active is not a boolean',
    mod: '@/lib/homes/api/homes.watches.server',
    method: 'PATCH',
    body: { id: 'w1', active: 'yes' },
    error: 'Invalid request',
  },
  {
    name: 'homes watch delete: no id',
    mod: '@/lib/homes/api/homes.watches.server',
    method: 'DELETE',
    url: 'https://rmhstudios.com/api/homes/watches',
    error: 'Missing id',
  },
  {
    name: 'homes watch delete: blank id',
    mod: '@/lib/homes/api/homes.watches.server',
    method: 'DELETE',
    url: 'https://rmhstudios.com/api/homes/watches?id=%20%20',
    error: 'Missing id',
  },
  {
    name: 'referral claim: code too short',
    mod: '@/lib/api/routes/referrals.claim.server',
    method: 'POST',
    body: { code: 'ab' },
    error: 'Invalid code',
  },
  {
    name: 'referral claim: no body',
    mod: '@/lib/api/routes/referrals.claim.server',
    method: 'POST',
    error: 'Invalid code',
  },
  {
    name: 'push subscribe: not a URL',
    mod: '@/lib/push/api/push.subscribe.server',
    method: 'POST',
    body: { endpoint: 'nope', keys: { p256dh: 'a', auth: 'b' } },
    error: 'Invalid subscription',
  },
  {
    name: 'comment reaction: empty emoji',
    mod: '@/lib/social/api/comments.$commentId.react.server',
    method: 'POST',
    body: { emoji: '' },
    params: { commentId: 'c1' },
    error: 'Invalid emoji',
  },
  {
    name: 'comment reaction: not an allowed reaction',
    mod: '@/lib/social/api/comments.$commentId.react.server',
    method: 'POST',
    body: { emoji: 'definitely-not-an-emoji' },
    params: { commentId: 'c1' },
    error: 'Invalid emoji',
  },
  {
    name: 'card review: grade out of range',
    mod: '@/app/routes/api/study/cards/$id/review',
    method: 'POST',
    body: { grade: 9 },
    params: { id: 'k1' },
    error: 'Invalid grade',
  },
  {
    name: 'card review: grade is a string',
    mod: '@/app/routes/api/study/cards/$id/review',
    method: 'POST',
    body: { grade: '2' },
    params: { id: 'k1' },
    error: 'Invalid grade',
  },
  {
    name: 'neon driftway score: score is a string',
    mod: '@/lib/game/api/neon-driftway.score.server',
    method: 'POST',
    body: { score: '12' },
    error: 'Invalid score',
  },
  {
    name: 'neon driftway score: no body',
    mod: '@/lib/game/api/neon-driftway.score.server',
    method: 'POST',
    error: 'Invalid score',
  },
  {
    name: 'synapse storm score: score without solved puzzles',
    mod: '@/lib/game/api/games.synapse-storm.score.server',
    method: 'POST',
    body: { score: 5, puzzlesSolved: 0, maxCombo: 0, peakDifficulty: 1, totalTime: 10 },
    error: 'Invalid score data',
  },
  {
    name: 'synapse storm score: unknown field (strict)',
    mod: '@/lib/game/api/games.synapse-storm.score.server',
    method: 'POST',
    body: { score: 0, puzzlesSolved: 0, maxCombo: 0, peakDifficulty: 1, totalTime: 1, cheat: 1 },
    error: 'Invalid score data',
  },
];

beforeEach(() => {
  h.getSession.mockResolvedValue({ user: { id: 'u1', isAdmin: false } });
});

describe('migrated routes keep their bespoke 400 messages', () => {
  for (const c of CASES) {
    it(c.name, async () => {
      const fn = await handler(c.mod, c.method);
      const res = await fn({
        params: c.params ?? {},
        request: new Request(c.url ?? 'https://rmhstudios.com/api/x', {
          method: c.method,
          headers: {
            cookie: 'better-auth.session_token=abc',
            'content-type': 'application/json',
            'cf-connecting-ip': `${Math.random()}`,
          },
          ...(c.body === undefined
            ? {}
            : { body: typeof c.body === 'string' ? c.body : JSON.stringify(c.body) }),
        }),
      });
      expect(res.status).toBe(400);
      await expect(res.json()).resolves.toEqual({ error: c.error });
    });
  }

  it('anonymous callers still get 401 before any validation', async () => {
    h.getSession.mockResolvedValue(null);
    const fn = await handler('@/lib/api/routes/referrals.claim.server', 'POST');
    const res = await fn({
      params: {},
      request: new Request('https://rmhstudios.com/api/x', {
        method: 'POST',
        headers: { cookie: 'better-auth.session_token=abc' },
        body: '{}',
      }),
    });
    expect(res.status).toBe(401);
  });
});
