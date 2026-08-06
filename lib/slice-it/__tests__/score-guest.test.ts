/**
 * Slice It — `/api/slice-it/score`, driven end to end.
 *
 * ## The property this file exists for
 *
 * **A guest submission persists nothing.** Not a `SliceRun`, not a
 * `SongLeaderboard` row, not a `Player` row, not a `User` row. The route accepts
 * an anonymous caller (`auth: 'optional'`, for the Discord Activity guest in
 * `X10`) and the *only* thing standing between "we accept it" and "we quietly
 * mint an account for a third party's Discord display name" is one early return.
 *
 * That is a privacy property, and privacy properties are exactly the kind that
 * regress silently: adding a write above the guard, or turning the guard into a
 * flag some later branch has to remember to check, breaks it without breaking a
 * single visible behaviour. So the assertion here is not "the response looks
 * right" — it is that **every Prisma method on the client was called zero
 * times**, whether or not this file knows the route uses it.
 *
 * The rest pins the R1 board key: a run is addressed by
 * `(songId, difficulty, modPool, userId)`, so a `normal` best can no longer
 * overwrite an `expert` record, which is what the old `(songId, userId)` key did.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

/* ─── Prisma, recorded rather than executed ──────────────────────────────── */

// `vi.mock` factories are hoisted above every `const` in the file, so the mock
// state has to be hoisted with them or the factory closes over a binding that
// does not exist yet.
const { calls, song, prismaMock, getSession } = vi.hoisted(() => {
  /** Every Prisma call the route makes, in order. `[model.method, args]`. */
  const calls: [string, unknown][] = [];

  const song = {
    id: 'song-1',
    duration: 180,
    isPublic: true,
    uploadedBy: 'someone-else',
    analysisData: { slices: { normal: Array.from({ length: 400 }, (_, i) => ({ id: `n${i}` })) } },
  };

  /** A recording stub that also returns whatever the test told it to. */
  const stub = (label: string, result?: (args: unknown) => unknown) =>
    vi.fn(async (args: unknown) => {
      calls.push([label, args]);
      return result ? result(args) : null;
    });

  const prismaMock = {
    song: { findUnique: stub('song.findUnique', () => song) },
    chart: { findFirst: stub('chart.findFirst') },
    sliceRun: { create: stub('sliceRun.create', () => ({ id: 1n })) },
    player: {
      upsert: stub('player.upsert', () => ({ totalScore: 1000, gamesPlayed: 1 })),
      findUnique: stub('player.findUnique'),
    },
    songLeaderboard: {
      findUnique: stub('songLeaderboard.findUnique'),
      upsert: stub('songLeaderboard.upsert', () => ({ id: 'lb-1' })),
    },
    user: { findUnique: stub('user.findUnique', () => ({ username: 'ada', name: 'Ada' })) },
  };

  return { calls, song, prismaMock, getSession: vi.fn() };
});

vi.mock('@/lib/auth', () => ({
  auth: { api: { getSession: (...a: unknown[]) => getSession(...a) } },
}));
vi.mock('@/lib/prisma.server', () => ({ prisma: prismaMock }));
// The rate limiter reaches for Redis and an in-process Map keyed by IP; neither
// is what this file is about, and a shared bucket would make the tenth test in
// the file fail for a reason that has nothing to do with it.
vi.mock('@/lib/rate-limit.server', () => ({ withRateLimitAsync: async () => null }));
vi.mock('@/lib/quests/engine.server', () => ({ recordGamePlay: async () => {} }));
vi.mock('@/lib/game/results.server', () => ({ reportGameResult: async () => {} }));
// A run with no token is tolerated by design (see `checkRunTiming`), so the
// bodies below simply omit one and this mock is never consulted.
vi.mock('@/lib/slice-it/run-token.server', () => ({
  verifyRunToken: () => ({ ok: false, reason: 'expired' as const }),
}));

import { Route } from '../../../app/routes/api/slice-it/score';
import { DEFAULT_MODIFIERS } from '../modifiers';
import type { Modifiers } from '../types';

/* ─── Harness ────────────────────────────────────────────────────────────── */

const handlers = (
  Route as unknown as {
    options: {
      server: {
        handlers: {
          POST: (a: { request: Request; params: Record<string, string> }) => Promise<Response>;
        };
      };
    };
  }
).options.server.handlers;

interface Body {
  songId?: string;
  score?: number;
  maxCombo?: number;
  accuracy?: number;
  modifiers?: Modifiers;
  [key: string]: unknown;
}

async function submit(body: Body): Promise<{ status: number; json: Record<string, unknown> }> {
  const request = new Request('https://rmhstudios.com/api/slice-it/score', {
    method: 'POST',
    // A unique IP per call, so nothing shares a rate-limit bucket even if the
    // limiter mock is ever removed.
    headers: { 'content-type': 'application/json', 'cf-connecting-ip': `${Math.random()}` },
    body: JSON.stringify({
      songId: song.id,
      score: 50_000,
      maxCombo: 200,
      accuracy: 0.97,
      modifiers: DEFAULT_MODIFIERS,
      ...body,
    }),
  });
  const response = await handlers.POST({ request, params: {} });
  return { status: response.status, json: (await response.json()) as Record<string, unknown> };
}

/** Every recorded call for one `model.method`. */
const callsTo = (label: string) => calls.filter(([name]) => name === label).map(([, args]) => args);

beforeEach(() => {
  calls.length = 0;
  getSession.mockReset();
  for (const model of Object.values(prismaMock)) {
    for (const method of Object.values(model)) (method as { mockClear: () => void }).mockClear();
  }
});

/* ─── The guest guard ────────────────────────────────────────────────────── */

describe('a guest submission', () => {
  beforeEach(() => getSession.mockResolvedValue(null));

  it('is accepted rather than refused', async () => {
    // The old default (`auth: 'required'`) 401'd before the handler body ran, so
    // a Discord Activity guest had no way to be told their own score.
    const { status, json } = await submit({});
    expect(status).toBe(200);
    expect(json.success).toBe(true);
  });

  it('persists NOTHING — no Prisma method is called at all', async () => {
    await submit({});
    // Deliberately not "the leaderboard was not written": the assertion is that
    // the guard is a return, so nothing downstream of it ran and no future write
    // added below it can slip past this test.
    expect(calls).toEqual([]);
  });

  it('says so in the response, so the client can offer to link an account', async () => {
    const { json } = await submit({});
    expect(json.stored).toBe(false);
    expect(json.ranked).toBe(false);
    expect(json.isNewBest).toBe(false);
  });

  it('still returns the computed run so the results screen has something to show', async () => {
    const { json } = await submit({ score: 12_345, accuracy: 0.96 });
    expect(json.score).toBe(12_345);
    expect(json.accuracy).toBeCloseTo(0.96, 5);
    expect(json.grade).toBe('S');
  });

  it('does not read the song row either', async () => {
    // Worth its own assertion: the guard is above the song lookup, so a guest
    // submission naming a private song learns nothing about whether it exists.
    await submit({ songId: 'someone-elses-private-song' });
    expect(callsTo('song.findUnique')).toEqual([]);
  });
});

/* ─── The signed-in path, and the R1 key ─────────────────────────────────── */

describe('a signed-in submission', () => {
  beforeEach(() => getSession.mockResolvedValue({ user: { id: 'user-1', name: 'Ada' } }));

  it('appends a run before it touches the personal best', async () => {
    await submit({});
    const order = calls.map(([name]) => name);
    expect(order).toContain('sliceRun.create');
    // R6's whole point: the history row exists even when the run is not a best,
    // and it is written before anything can overwrite anything.
    expect(order.indexOf('sliceRun.create')).toBeLessThan(order.indexOf('songLeaderboard.upsert'));
  });

  it('addresses the board by (songId, difficulty, modPool, userId)', async () => {
    await submit({ modifiers: { ...DEFAULT_MODIFIERS, difficulty: 'expert' } });
    const [where] = callsTo('songLeaderboard.findUnique') as {
      where: { songId_difficulty_modPool_userId: Record<string, string> };
    }[];
    expect(where.where.songId_difficulty_modPool_userId).toEqual({
      songId: song.id,
      difficulty: 'expert',
      modPool: 'none',
      userId: 'user-1',
    });
  });

  it('derives the pool server-side rather than trusting the body', async () => {
    await submit({
      modifiers: { ...DEFAULT_MODIFIERS, invisible: true },
      // A client claiming its own pool is exactly the thing the old route did
      // with `scoreMultiplier`, and it is not expressible here.
      modPool: 'none',
    });
    const [run] = callsTo('sliceRun.create') as { data: { modPool: string } }[];
    expect(run.data.modPool).toBe('challenge');
  });

  it('records the client-declared lamps without letting them reach the ranking', async () => {
    await submit({ isFullCombo: true, isPerfect: true, cleared: false });
    const [run] = callsTo('sliceRun.create') as {
      data: { isFullCombo: boolean; isPerfect: boolean; cleared: boolean };
    }[];
    expect(run.data).toMatchObject({ isFullCombo: true, isPerfect: true, cleared: false });

    // And the run is still a new best purely on score — the lamps decided
    // nothing. `findUnique` returned null, so there was no previous row.
    const [upsert] = callsTo('songLeaderboard.upsert') as {
      create: { score: number; isFullCombo: boolean };
    }[];
    expect(upsert.create.score).toBe(50_000);
    expect(upsert.create.isFullCombo).toBe(true);
  });

  it('carries the integrity verdict onto the run and does not act on it', async () => {
    // A timing distribution far too tight to be human. `integrity.ts` flags and
    // never rejects, and this route must not invent an escalation of its own.
    const { status, json } = await submit({
      timing: { samples: 400, meanMs: 1, stdDevMs: 0.4 },
    });
    expect(status).toBe(200);
    expect(json.stored).toBe(true);

    const [run] = callsTo('sliceRun.create') as {
      data: { suspicion: number; suspicions: string[] };
    }[];
    expect(run.data.suspicions).toContain('timing_too_precise');
    expect(run.data.suspicion).toBeGreaterThan(0);
  });

  it('never selects the run row back', async () => {
    // `SliceRun.id` is a BigInt and `JSON.stringify` throws on one. Selecting it
    // into a response is a 500 that only fires once the table has rows.
    await submit({});
    const [run] = callsTo('sliceRun.create') as { select: Record<string, boolean> }[];
    expect(run.select).toEqual({ id: true });
  });

  it('passes an explicit select to the leaderboard upsert', async () => {
    // Without one, Prisma returns the whole row — including the `modifiers`
    // blob — into a variable nobody reads. A recent security pass fixed exactly
    // this twice.
    await submit({});
    const [upsert] = callsTo('songLeaderboard.upsert') as { select: Record<string, boolean> }[];
    expect(upsert.select).toEqual({ id: true });
  });

  it('refuses a run below 1.0x without writing anything', async () => {
    const { status, json } = await submit({
      modifiers: { ...DEFAULT_MODIFIERS, speed: 0.5 },
    });
    expect(status).toBe(400);
    expect(json.ranked).toBe(false);
    expect(calls).toEqual([]);
  });

  it('drops a chart id that belongs to another song', async () => {
    // `chart.findFirst` is stubbed to null — i.e. no chart matched
    // `(id, songId)` — and the run must record no chart rather than the id it
    // was handed.
    await submit({ chartId: '00000000-0000-4000-8000-000000000000' });
    const [run] = callsTo('sliceRun.create') as { data: { chartId: string | null } }[];
    expect(run.data.chartId).toBeNull();
  });
});
