import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  runTask: vi.fn(),
  recordError: vi.fn(),
  refund: vi.fn(async () => undefined),
  release: vi.fn(async () => undefined),
}));
// The real `jsonFromModelText` and the real runner; only the network call and the ledger are replaced.
vi.mock('@/lib/ai/provider.server', async () => {
  const actual = await vi.importActual<typeof import('@/lib/ai/provider.server')>('@/lib/ai/provider.server');
  return { ...actual, runTask: m.runTask };
});
vi.mock('@/lib/perf/process-metrics', () => ({ recordError: m.recordError, recordCounter: vi.fn() }));
vi.mock('../qa/budget.server', () => ({
  admitQuestion: async () => ({ tier: 'free', remainingToday: 24, dailyCap: 25, release: m.release, refund: m.refund }),
}));
vi.mock('@/lib/prisma.server', () => ({ prisma: {} }));
vi.mock('./directory.server', () => ({ importDirectory: async () => ({ dir: [], aliases: new Map() }) }));

import { jsonFromModelText } from '@/lib/ai/provider.server';
import { AppError } from '@/lib/errors/codes';
import { parseImport } from './parse.server';

const SENTINEL = 'SENTINEL-4f9c1e-member-secret';
const NOW = new Date('2027-03-01T15:00:00Z');
const paste = { kind: 'paste' as const, text: 'Harvard secondary 7/20/2026' };

let spies: ReturnType<typeof vi.spyOn>[];
beforeEach(() => {
  m.runTask.mockReset();
  m.recordError.mockReset();
  m.refund.mockClear();
  spies = (['log', 'warn', 'error', 'info', 'debug'] as const).map((k) => vi.spyOn(console, k).mockImplementation(() => undefined));
});
afterEach(() => vi.restoreAllMocks());

const everythingSeen = () => JSON.stringify([...spies.map((s) => s.mock.calls), m.recordError.mock.calls]);

describe('model text never reaches an error, a log or the error feed', () => {
  it('jsonFromModelText throws a fixed message for malformed JSON', () => {
    const err = (() => {
      try {
        jsonFromModelText(`{"rows":[{"schoolName":"${SENTINEL}", "date": }`);
      } catch (e) {
        return e as Error;
      }
      return null;
    })();
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).code).toBe('AI_UNAVAILABLE');
    expect(`${err!.message} ${err!.stack}`).not.toContain(SENTINEL);
  });

  it.each([
    ['truncated JSON', `{"rows":[{"schoolName":"${SENTINEL}","milestones":[{"type":"SUBMITTED","date":"2026-06-1`],
    ['broken JSON between braces', `{"rows":[{"schoolName":"${SENTINEL}",,}]}`],
    ['prose', `Sure! Here is ${SENTINEL} without braces`],
  ])('%s: a fixed AI_UNAVAILABLE, a refund, and the sentinel nowhere', async (_name, reply) => {
    m.runTask.mockResolvedValue(reply);
    const err = (await parseImport({ userId: 'u1', input: paste }, { now: NOW }).catch((e: unknown) => e)) as AppError;
    expect(err).toBeInstanceOf(AppError);
    expect(err.code).toBe('AI_UNAVAILABLE');
    expect(JSON.stringify(err.toBody())).not.toContain(SENTINEL);
    expect(`${err.message}\n${err.stack}\n${String(err.cause ?? '')}`).not.toContain(SENTINEL);
    expect(m.refund).toHaveBeenCalledTimes(1);
    expect(everythingSeen()).not.toContain(SENTINEL);
  });
});
