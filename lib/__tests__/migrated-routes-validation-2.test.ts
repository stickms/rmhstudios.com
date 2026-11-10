/**
 * Batch 10 of the API-handling migration: score/economy routes that used to run
 * `auth: 'none'` with an inline `getSession` + a hand-rolled body parse and now ride
 * `implement()`/`defineHandler`. Each keeps its exact 400 text (pinned here) and its
 * 401-before-400 order. Drives the real route handlers, like
 * `migrated-routes-validation.test.ts`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ getSession: vi.fn() }));

vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: h.getSession } } }));
vi.mock('@/lib/prisma.server', () => ({ prisma: {} }));
vi.mock('@/lib/quests/engine.server', () => ({ recordGamePlay: vi.fn() }));
vi.mock('@/lib/xp/engine.server', () => ({ awardXp: vi.fn() }));
vi.mock('@/lib/game/results.server', () => ({ reportGameResult: vi.fn() }));
vi.mock('@/lib/economy/ledger.server', () => ({
  creditCoins: vi.fn(),
  debitCoins: vi.fn(),
  getBalance: vi.fn(),
}));
vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (config: unknown) => ({ options: config }),
}));

type Handler = (a: { request: Request; params: Record<string, string> }) => Promise<Response>;

async function handler(mod: string, method: string): Promise<Handler> {
  const m = (await import(/* @vite-ignore */ mod)) as {
    Route: { options: { server: { handlers: Record<string, Handler> } } };
  };
  return m.Route.options.server.handlers[method]!;
}

interface Case {
  name: string;
  mod: string;
  body?: unknown;
  error: string;
}

const VEGA = '@/app/routes/api/vega/score';
const LAUNDRY = '@/app/routes/api/laundry-sort/score';
const FORGE = '@/app/routes/api/signal-forge/score';
const ALTAIR_SCORE = '@/app/routes/api/altair/score';
const ALTAIR_META = '@/app/routes/api/altair/meta';
const BET = '@/app/routes/api/coins/bet';
const PURCHASE = '@/app/routes/api/coins/purchase';
const VERSECRAFT = '@/app/routes/api/versecraft/save';
const PASS_CLAIM = '@/app/routes/api/battlepass/claim';
const PASS_UNLOCK = '@/app/routes/api/battlepass/unlock';

const CASES: Case[] = [
  {
    name: 'vega: loop is a string',
    mod: VEGA,
    body: { highestLoop: '3', highestLevel: 1 },
    error: 'Invalid data',
  },
  {
    name: 'vega: unknown field (strict)',
    mod: VEGA,
    body: { highestLoop: 1, highestLevel: 1, x: 1 },
    error: 'Invalid data',
  },
  {
    name: 'vega: loop over the cap',
    mod: VEGA,
    body: { highestLoop: 100_001, highestLevel: 1 },
    error: 'Invalid data',
  },
  { name: 'vega: malformed JSON', mod: VEGA, body: '{nope', error: 'Invalid data' },

  { name: 'laundry: empty body', mod: LAUNDRY, body: {}, error: 'Invalid input' },
  {
    name: 'laundry: duration not an allowed length',
    mod: LAUNDRY,
    body: {
      score: 1,
      sorted: 1,
      wrong: 0,
      missed: 0,
      bestCombo: 1,
      durationSec: 7,
      difficulty: 'easy',
    },
    error: 'Invalid input',
  },
  { name: 'laundry: malformed JSON', mod: LAUNDRY, body: '{nope', error: 'Invalid input' },

  {
    name: 'signal forge: score is a string',
    mod: FORGE,
    body: { score: '5', floorReached: 2 },
    error: 'Invalid score',
  },
  {
    name: 'signal forge: negative score',
    mod: FORGE,
    body: { score: -1, floorReached: 2 },
    error: 'Invalid score',
  },
  {
    name: 'signal forge: score over the cap',
    mod: FORGE,
    body: { score: 1_000_001, floorReached: 2 },
    error: 'Invalid score',
  },
  {
    name: 'signal forge: floor 0',
    mod: FORGE,
    body: { score: 5, floorReached: 0 },
    error: 'Invalid floor',
  },
  {
    name: 'signal forge: floor 101',
    mod: FORGE,
    body: { score: 5, floorReached: 101 },
    error: 'Invalid floor',
  },
  { name: 'signal forge: floor missing', mod: FORGE, body: { score: 5 }, error: 'Invalid floor' },
  {
    name: 'signal forge: both bad names the score',
    mod: FORGE,
    body: { score: -1, floorReached: 0 },
    error: 'Invalid score',
  },
  { name: 'signal forge: array body', mod: FORGE, body: [], error: 'Invalid score' },

  {
    name: 'altair score: time over a day',
    mod: ALTAIR_SCORE,
    body: { timeSurvived: 86401, kills: 1, totalXP: 1 },
    error: 'Invalid time',
  },
  {
    name: 'altair score: kills negative',
    mod: ALTAIR_SCORE,
    body: { timeSurvived: 10, kills: -1, totalXP: 1 },
    error: 'Invalid kills',
  },
  {
    name: 'altair score: xp missing',
    mod: ALTAIR_SCORE,
    body: { timeSurvived: 10, kills: 1 },
    error: 'Invalid XP',
  },
  {
    name: 'altair score: time wins over kills',
    mod: ALTAIR_SCORE,
    body: { timeSurvived: 'x', kills: 'y', totalXP: 1 },
    error: 'Invalid time',
  },

  {
    name: 'altair meta: coins missing',
    mod: ALTAIR_META,
    body: { upgrades: {}, unlockedClasses: [] },
    error: 'Invalid coins',
  },
  {
    name: 'altair meta: coins over the cap',
    mod: ALTAIR_META,
    body: { coins: 100_000_001, upgrades: {}, unlockedClasses: [] },
    error: 'Invalid coins',
  },
  {
    name: 'altair meta: upgrades is an array',
    mod: ALTAIR_META,
    body: { coins: 1, upgrades: [], unlockedClasses: [] },
    error: 'Invalid upgrades',
  },
  {
    name: 'altair meta: upgrades is null',
    mod: ALTAIR_META,
    body: { coins: 1, upgrades: null, unlockedClasses: [] },
    error: 'Invalid upgrades',
  },
  {
    name: 'altair meta: unlockedClasses not an array',
    mod: ALTAIR_META,
    body: { coins: 1, upgrades: {}, unlockedClasses: 'knight' },
    error: 'Invalid unlockedClasses',
  },

  {
    name: 'coins bet: bin out of range',
    mod: BET,
    body: { bin: 9, amount: 5 },
    error: 'Too big: expected number to be <=4',
  },
  {
    name: 'coins bet: zero stake',
    mod: BET,
    body: { bin: 1, amount: 0 },
    error: 'Too small: expected number to be >=1',
  },
  {
    name: 'coins purchase: unknown item',
    mod: PURCHASE,
    body: { item: 'nope' },
    error: 'Invalid input: expected "profile-pet"',
  },

  {
    name: 'versecraft save: malformed JSON',
    mod: VERSECRAFT,
    body: '{nope',
    error: 'Invalid JSON body',
  },
  {
    name: 'versecraft save: no saveData',
    mod: VERSECRAFT,
    body: {},
    error: 'Missing or invalid saveData',
  },
  {
    name: 'versecraft save: saveData is a string',
    mod: VERSECRAFT,
    body: { saveData: 'x' },
    error: 'Missing or invalid saveData',
  },
  {
    name: 'versecraft save: saveData is null',
    mod: VERSECRAFT,
    body: { saveData: null },
    error: 'Missing or invalid saveData',
  },

  {
    name: 'battlepass claim: malformed JSON',
    mod: PASS_CLAIM,
    body: '{nope',
    error: 'Invalid input',
  },
  {
    name: 'battlepass claim: tier 0',
    mod: PASS_CLAIM,
    body: { tier: 0, track: 'free' },
    error: 'Invalid input',
  },
  {
    name: 'battlepass claim: unknown track',
    mod: PASS_CLAIM,
    body: { tier: 1, track: 'gold' },
    error: 'Invalid input',
  },
];

/** Every migrated POST, for the signed-out check (body deliberately invalid). */
const POSTS = [
  VEGA,
  LAUNDRY,
  FORGE,
  ALTAIR_SCORE,
  ALTAIR_META,
  BET,
  PURCHASE,
  '@/app/routes/api/coins/claim',
  '@/app/routes/api/signal-forge/abandon',
  VERSECRAFT,
  PASS_CLAIM,
  PASS_UNLOCK,
];

function post(body?: unknown): Request {
  return new Request('https://rmhstudios.com/api/x', {
    method: 'POST',
    headers: {
      cookie: 'better-auth.session_token=abc',
      'content-type': 'application/json',
      'cf-connecting-ip': `${Math.random()}`,
    },
    ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }),
  });
}

beforeEach(() => {
  h.getSession.mockResolvedValue({ user: { id: 'u1', name: 'U', isAdmin: false } });
});

describe('batch 10 routes keep their bespoke 400 messages', () => {
  for (const c of CASES) {
    it(c.name, async () => {
      const fn = await handler(c.mod, 'POST');
      const res = await fn({ params: {}, request: post(c.body) });
      expect(res.status).toBe(400);
      await expect(res.json()).resolves.toEqual({ error: c.error });
    });
  }
});

describe('batch 10 routes answer 401 before looking at the body', () => {
  for (const mod of POSTS) {
    it(mod, async () => {
      h.getSession.mockResolvedValue(null);
      const fn = await handler(mod, 'POST');
      const res = await fn({ params: {}, request: post('{nope') });
      expect(res.status).toBe(401);
      await expect(res.json()).resolves.toEqual({ error: 'Unauthorized' });
    });
  }

  it('a request with no session cookie is 401 without a lookup', async () => {
    h.getSession.mockClear();
    const fn = await handler(VEGA, 'POST');
    const res = await fn({
      params: {},
      request: new Request('https://rmhstudios.com/api/x', { method: 'POST', body: '{}' }),
    });
    expect(res.status).toBe(401);
    expect(h.getSession).not.toHaveBeenCalled();
  });
});
