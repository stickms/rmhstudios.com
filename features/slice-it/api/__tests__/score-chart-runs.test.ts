/**
 * Slice It — `/api/slice-it/score` for a run on a picked chart.
 *
 * The properties: a run that names a chart NEVER writes the song's board (the board key has no chart dimension, so a
 * member chart's run would overwrite the player's best on the generated chart); `isNewBest` for a chart run is decided
 * against the player's earlier runs on that chart; only a new best on a ranked chart schedules the skill recompute;
 * the sampled miss heat is recorded for a sampled, cleared run on a published chart and for nothing else; and a
 * failure while recording it never fails the submission. In-memory stand-ins, no database.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => {
  const calls: [string, unknown][] = [];
  const state = {
    runId: 1n,
    chart: null as null | { id: string; chartHash: string; rankStatus: string; notes: unknown },
    previousChartRun: null as null | { score: number },
    transactionFails: false,
    recompute: [] as string[],
  };
  const stub = (label: string, result?: (args: unknown) => unknown) =>
    vi.fn(async (args: unknown) => {
      calls.push([label, args]);
      return result ? result(args) : null;
    });
  const prismaMock = {
    song: {
      findUnique: stub('song.findUnique', () => ({
        id: 'song-1',
        duration: 180,
        isPublic: true,
        uploadedBy: 'someone-else',
        analysisData: { slices: { normal: Array.from({ length: 400 }, (_, i) => ({ id: `n${i}` })) } },
      })),
    },
    chart: { findFirst: stub('chart.findFirst', () => state.chart) },
    sliceRun: {
      create: stub('sliceRun.create', () => ({ id: state.runId })),
      findFirst: stub('sliceRun.findFirst', () => state.previousChartRun),
    },
    player: {
      upsert: stub('player.upsert', () => ({ totalScore: 1000, gamesPlayed: 1 })),
      findUnique: stub('player.findUnique'),
    },
    songLeaderboard: {
      findUnique: stub('songLeaderboard.findUnique'),
      upsert: stub('songLeaderboard.upsert', () => ({ id: 'lb-1' })),
    },
    sliceNoteStat: { upsert: stub('sliceNoteStat.upsert', (args) => args) },
    user: { findUnique: stub('user.findUnique', () => ({ username: 'ada', name: 'Ada' })) },
    $transaction: vi.fn(async (operations: Promise<unknown>[]) => {
      calls.push(['$transaction', operations.length]);
      if (state.transactionFails) throw new Error('database is down');
      return Promise.all(operations);
    }),
  };
  return { calls, state, prismaMock, getSession: vi.fn() };
});

vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: (...a: unknown[]) => h.getSession(...a) } } }));
vi.mock('@/lib/prisma.server', () => ({ prisma: h.prismaMock }));
vi.mock('@/lib/rate-limit.server', () => ({ withRateLimitAsync: async () => null }));
vi.mock('@/lib/quests/engine.server', () => ({ recordGamePlay: async () => {} }));
vi.mock('@/lib/game/results.server', () => ({ reportGameResult: async () => {} }));
vi.mock('@/lib/storage/s3.server', () => ({ listObjects: async () => [] }));
vi.mock('@features/slice-it/engine/run-token.server', () => ({
  verifyRunToken: () => ({ ok: false, reason: 'expired' as const }),
}));
vi.mock('@features/slice-it/engine/progression.server', () => ({
  reportSliceItRun: async () => {},
  getPracticeStreak: async () => null,
}));
vi.mock('@features/slice-it/engine/rating.server', () => ({
  scheduleSkillRecompute: (userId: string) => h.state.recompute.push(userId),
}));
vi.mock('@features/slice-it/engine/ranking.server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@features/slice-it/engine/ranking.server')>()),
  evaluateQualification: async () => null,
}));

import { handlersOf } from '@/lib/__tests__/api-handlers-of';
import { route } from '@features/slice-it/api/slice-it.score.server';
import { DEFAULT_MODIFIERS } from '@features/slice-it/engine/modifiers';
import { shouldSampleRun } from '@features/slice-it/engine/chart-health';

const handlers = handlersOf(route);
const CHART_ID = '3f2b8c1e-9d4a-4e6b-8a57-1c2d3e4f5a6b';
const HASH = 'a'.repeat(64);
/** 400 notes, one every 0.4 s: 0, 400, 800 … milliseconds. */
const CHART_NOTES = Array.from({ length: 400 }, (_, i) => ({ id: `c${i}`, time: i * 0.4, lane: i % 2, type: 'TAP' }));

function chartRow(rankStatus: string) {
  return { id: CHART_ID, chartHash: HASH, rankStatus, notes: CHART_NOTES };
}

/** A run id the sampler counts, and one it does not. */
function runIdWhere(sampled: boolean): bigint {
  for (let i = 1; i < 1000; i++) if (shouldSampleRun(String(i)) === sampled) return BigInt(i);
  throw new Error('no run id found');
}

async function submit(body: Record<string, unknown>) {
  const request = new Request('https://rmhstudios.com/api/slice-it/score', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'cf-connecting-ip': `${Math.random()}`,
      cookie: 'better-auth.session_token=abc',
    },
    body: JSON.stringify({
      songId: 'song-1',
      score: 50_000,
      maxCombo: 200,
      accuracy: 0.97,
      modifiers: DEFAULT_MODIFIERS,
      ...body,
    }),
  });
  const response = await handlers.POST!({ request, params: {} });
  // The miss write is fire-and-forget: let it settle before asserting on it.
  await new Promise((resolve) => setTimeout(resolve, 0));
  return { status: response.status, json: (await response.json()) as Record<string, unknown> };
}

const callsTo = (label: string) => h.calls.filter(([name]) => name === label).map(([, args]) => args);

beforeEach(() => {
  h.calls.length = 0;
  h.state.runId = runIdWhere(true);
  h.state.chart = chartRow('unranked');
  h.state.previousChartRun = null;
  h.state.transactionFails = false;
  h.state.recompute.length = 0;
  h.getSession.mockReset();
  h.getSession.mockResolvedValue({ user: { id: 'user-1', name: 'Ada' } });
});

describe('a run on a picked chart', () => {
  it('never writes the song board, and is recorded as a run of that chart', async () => {
    const { status, json } = await submit({ chartId: CHART_ID });
    expect(status).toBe(200);
    expect(json.stored).toBe(true);
    expect(callsTo('songLeaderboard.findUnique')).toEqual([]);
    expect(callsTo('songLeaderboard.upsert')).toEqual([]);
    const [run] = callsTo('sliceRun.create') as { data: Record<string, unknown> }[];
    expect(run!.data).toMatchObject({ chartId: CHART_ID, chartHash: HASH });
  });

  it('keeps the board off even when the chart no longer resolves (a draft, a deleted or another song’s chart)', async () => {
    h.state.chart = null;
    const { json } = await submit({ chartId: CHART_ID });
    expect(callsTo('songLeaderboard.upsert')).toEqual([]);
    expect(json.isNewBest).toBe(false);
    const [run] = callsTo('sliceRun.create') as { data: Record<string, unknown> }[];
    expect(run!.data).toMatchObject({ chartId: null, chartHash: null });
  });

  it('resolves only a published chart of this song', async () => {
    await submit({ chartId: CHART_ID });
    const [lookup] = callsTo('chart.findFirst') as { where: Record<string, unknown> }[];
    expect(lookup!.where).toEqual({ id: CHART_ID, songId: 'song-1', status: { in: ['public', 'ranked'] } });
  });

  it('still writes the board for a run of the generated chart', async () => {
    h.state.chart = null;
    await submit({});
    expect(callsTo('songLeaderboard.upsert')).toHaveLength(1);
  });

  it('decides isNewBest from the earlier runs on the chart, read before this run is written', async () => {
    h.state.previousChartRun = { score: 80_000 };
    const worse = await submit({ chartId: CHART_ID });
    expect(worse.json.isNewBest).toBe(false);
    expect(worse.json.previousBest).toBe(80_000);

    h.calls.length = 0;
    h.state.previousChartRun = { score: 10_000 };
    const better = await submit({ chartId: CHART_ID });
    expect(better.json.isNewBest).toBe(true);

    const order = h.calls.map(([name]) => name);
    expect(order.indexOf('sliceRun.findFirst')).toBeLessThan(order.indexOf('sliceRun.create'));
    const [lookup] = callsTo('sliceRun.findFirst') as { where: Record<string, unknown> }[];
    expect(lookup!.where).toEqual({ userId: 'user-1', chartId: CHART_ID, difficulty: 'normal', modPool: 'none' });
  });
});

describe('the skill rating recompute', () => {
  it('is scheduled by a new best on a ranked chart', async () => {
    h.state.chart = chartRow('ranked');
    await submit({ chartId: CHART_ID });
    expect(h.state.recompute).toEqual(['user-1']);
  });

  it('is not scheduled when the run does not beat the earlier best', async () => {
    h.state.chart = chartRow('ranked');
    h.state.previousChartRun = { score: 90_000 };
    await submit({ chartId: CHART_ID });
    expect(h.state.recompute).toEqual([]);
  });

  it('is not scheduled for an unranked chart', async () => {
    await submit({ chartId: CHART_ID });
    expect(h.state.recompute).toEqual([]);
  });
});

describe('the sampled miss heat', () => {
  const noMisses = { noteCount: 400, missedNoteMs: [] as number[] };

  it('records every note of the chart for a sampled, cleared run, marking the missed ones', async () => {
    await submit({ chartId: CHART_ID, cleared: true, noteCount: 400, missedNoteMs: [400, 800, 800] });
    const upserts = callsTo('sliceNoteStat.upsert') as {
      create: { noteMs: number; attempts: number; misses: number };
    }[];
    expect(upserts).toHaveLength(400);
    expect(upserts.every((u) => u.create.attempts === 1)).toBe(true);
    // 800 was sent twice but is one note: the second is dropped.
    expect(upserts.filter((u) => u.create.misses === 1).map((u) => u.create.noteMs)).toEqual([400, 800]);
  });

  it('drops a time the chart does not have', async () => {
    await submit({ chartId: CHART_ID, cleared: true, noteCount: 400, missedNoteMs: [401, 123_456, 1200] });
    const upserts = callsTo('sliceNoteStat.upsert') as { create: { noteMs: number; misses: number } }[];
    expect(upserts.filter((u) => u.create.misses === 1).map((u) => u.create.noteMs)).toEqual([1200]);
  });

  it('records nothing for a run that is not sampled', async () => {
    h.state.runId = runIdWhere(false);
    await submit({ chartId: CHART_ID, cleared: true, ...noMisses });
    expect(callsTo('sliceNoteStat.upsert')).toEqual([]);
  });

  it('records nothing for a run that was not cleared', async () => {
    await submit({ chartId: CHART_ID, cleared: false, ...noMisses });
    expect(callsTo('sliceNoteStat.upsert')).toEqual([]);
  });

  it('records nothing for the generated chart, which has no identity', async () => {
    h.state.chart = null;
    await submit({ cleared: true, ...noMisses });
    expect(callsTo('sliceNoteStat.upsert')).toEqual([]);
  });

  it('records nothing when the declared note count is not the chart’s', async () => {
    await submit({ chartId: CHART_ID, cleared: true, noteCount: 399, missedNoteMs: [400] });
    expect(callsTo('sliceNoteStat.upsert')).toEqual([]);
  });

  it('records nothing when the run sent no miss list', async () => {
    await submit({ chartId: CHART_ID, cleared: true });
    expect(callsTo('sliceNoteStat.upsert')).toEqual([]);
  });

  it('never fails the submission when recording fails', async () => {
    h.state.transactionFails = true;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { status, json } = await submit({ chartId: CHART_ID, cleared: true, ...noMisses });
    expect(status).toBe(200);
    expect(json.success).toBe(true);
    expect(warn).toHaveBeenCalledWith('[slice-it] note stats write failed', expect.anything());
    warn.mockRestore();
  });
});
