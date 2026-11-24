import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  release: vi.fn(async () => undefined),
  refund: vi.fn(async () => undefined),
  admitQuestion: vi.fn(),
}));
vi.mock('../qa/budget.server', () => ({ admitQuestion: m.admitQuestion }));
// The real runner imports the provider (and Prisma); the tests pass their own.
vi.mock('./runner.server', () => ({ aiImportRunner: {} }));
const DIR = [
  {
    slug: 'harvard',
    name: 'Harvard Medical School',
    shortName: 'Harvard',
    state: 'MA',
    interviewFormat: null,
    degree: 'MD',
  },
  {
    slug: 'johns-hopkins',
    name: 'Johns Hopkins University School of Medicine',
    shortName: 'Johns Hopkins',
    state: 'MD',
    interviewFormat: null,
    degree: 'MD',
  },
];
const d = vi.hoisted(() => ({
  importDirectory: vi.fn(async (_opts?: { fresh?: boolean }) => ({ dir: [] as unknown[], aliases: new Map() })),
}));
vi.mock('./directory.server', () => ({ importDirectory: d.importDirectory }));

import { MEDSCHOOLS_IMPORT, SAFETY_FRAME } from '@/lib/ai/prompts';
import { AppError } from '@/lib/errors/codes';
import { parseImport } from './parse.server';
import { UnreadableReplyError } from './unreadable';
import type { ImportRunner } from './runner.server';

const NOW = new Date('2027-03-01T15:00:00Z');
const fixture = (name: string) => readFileSync(join(__dirname, '__fixtures__', name));
const csv = { kind: 'file' as const, buffer: fixture('cycle.csv'), mimeType: 'text/csv', filename: 'cycle.csv' };
const gate = { tier: 'free', remainingToday: 24, dailyCap: 25, release: m.release, refund: m.refund };
const reply = {
  rows: [
    {
      schoolName: 'Harvard Medical School',
      program: 'MD',
      milestones: [
        { type: 'SUBMITTED', date: '2026-06-12', raw: '2026-06-12' },
        { type: 'INTERVIEW', date: '2026-10-05', raw: '2026-10-05' },
        { type: 'ACCEPTANCE', date: '2026-12-15', raw: 'Accepted 2026-12-15' },
      ],
    },
  ],
  cycleHint: null,
};
const runnerOf = (out: unknown): { runner: ImportRunner; calls: string[][] } => {
  const calls: string[][] = [];
  return {
    calls,
    runner: {
      run: vi.fn(async (...a: unknown[]) => {
        calls.push(a as string[]);
        if (out instanceof Error) throw out;
        return out;
      }),
    },
  };
};
const code = async (p: Promise<unknown>) => ((await p.catch((e: unknown) => e)) as AppError).code;

let logs: ReturnType<typeof vi.spyOn>[];
beforeEach(() => {
  m.release.mockReset().mockResolvedValue(undefined);
  m.refund.mockReset().mockResolvedValue(undefined);
  m.admitQuestion.mockReset().mockResolvedValue(gate);
  logs = (['log', 'warn', 'error', 'info'] as const).map((k) =>
    vi.spyOn(console, k).mockImplementation(() => undefined),
  );
});
afterEach(() => vi.restoreAllMocks());

describe('parseImport', () => {
  beforeEach(() => {
    d.importDirectory.mockReset();
    d.importDirectory.mockImplementation(async () => ({ dir: DIR, aliases: new Map() }));
  });

  it('a name the cached directory does not know is looked up once more, fresh (a school added within the cache TTL)', async () => {
    d.importDirectory.mockImplementation(async (opts?: { fresh?: boolean }) => ({
      dir: opts?.fresh ? DIR : DIR.filter((s) => s.slug !== 'harvard'),
      aliases: new Map(),
    }));
    const r = await parseImport({ userId: 'u1', input: csv }, { runner: runnerOf(reply).runner, now: NOW });
    expect(r.rows[0]).toMatchObject({ school: { slug: 'harvard' } });
    expect(d.importDirectory).toHaveBeenCalledTimes(2);
    expect(d.importDirectory).toHaveBeenLastCalledWith({ fresh: true });
  });

  it('every name matched: the cached directory is enough', async () => {
    await parseImport({ userId: 'u1', input: csv }, { runner: runnerOf(reply).runner, now: NOW });
    expect(d.importDirectory).toHaveBeenCalledTimes(1);
  });

  it('reads a file into a preview with ONE model call, the injection frame, and the lease released', async () => {
    const { runner, calls } = runnerOf(reply);
    const r = await parseImport({ userId: 'u1', input: csv }, { runner, now: NOW });
    expect(r.cycleYear).toBe(2027);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]).toMatchObject({ school: { slug: 'harvard', degree: 'MD' }, program: 'REG' });
    expect(r.rows[0]!.milestones.map((x) => x.type)).toEqual(['SUBMITTED', 'INTERVIEW', 'ACCEPTANCE']);
    expect(r).toMatchObject({ tier: 'free', remainingToday: 24, dailyCap: 25, truncated: false });
    expect(calls).toHaveLength(1);
    const [system, user] = calls[0]!;
    expect(system).toContain(SAFETY_FRAME);
    expect(system).toContain(MEDSCHOOLS_IMPORT.instructions);
    // the file's text is data, one row per line
    expect(user!.startsWith('<user-content>')).toBe(true);
    expect(JSON.parse(user!.replace(/^<user-content>\n|\n<\/user-content>$/g, '')).text).toContain(
      'Harvard Medical School | MD | 2026-06-12',
    );
    expect(m.admitQuestion).toHaveBeenCalledWith('u1', NOW, { isAdmin: false });
    expect(m.release).toHaveBeenCalledTimes(1);
  });

  it('passes the admin flag to the gate', async () => {
    await parseImport({ userId: 'a1', isAdmin: true, input: csv }, { runner: runnerOf(reply).runner, now: NOW });
    expect(m.admitQuestion).toHaveBeenCalledWith('a1', NOW, { isAdmin: true });
  });

  it('a refused gate (cap, busy, paused, budget) stops before the model', async () => {
    for (const c of [
      'MEDSCHOOLS_QA_DAILY_CAP',
      'MEDSCHOOLS_QA_BUSY',
      'MEDSCHOOLS_QA_PAUSED',
      'AI_BUDGET_EXCEEDED',
    ] as const) {
      m.admitQuestion.mockRejectedValueOnce(new AppError(c));
      const { runner, calls } = runnerOf(reply);
      expect(await code(parseImport({ userId: 'u1', input: csv }, { runner, now: NOW }))).toBe(c);
      expect(calls).toHaveLength(0);
    }
  });

  it('a file we cannot read, or that has no digits, costs no question', async () => {
    const { runner, calls } = runnerOf(reply);
    expect(
      await code(
        parseImport(
          { userId: 'u1', input: { kind: 'file', buffer: Buffer.from('x'), mimeType: 'image/png', filename: 'a.png' } },
          { runner, now: NOW },
        ),
      ),
    ).toBe('MEDSCHOOLS_IMPORT_UNSUPPORTED');
    expect(
      await code(
        parseImport({ userId: 'u1', input: { kind: 'paste', text: 'no dates in this at all' } }, { runner, now: NOW }),
      ),
    ).toBe('MEDSCHOOLS_IMPORT_EMPTY');
    expect(m.admitQuestion).not.toHaveBeenCalled();
    expect(calls).toHaveLength(0);
  });

  it('nothing grounded is "nothing found", and the lease is still released', async () => {
    const invented = {
      rows: [
        {
          schoolName: 'Harvard Medical School',
          milestones: [{ type: 'SUBMITTED', date: '2026-01-01', raw: '2026-01-01' }],
        },
      ],
    };
    expect(await code(parseImport({ userId: 'u1', input: csv }, { runner: runnerOf(invented).runner, now: NOW }))).toBe(
      'MEDSCHOOLS_IMPORT_EMPTY',
    );
    expect(m.release).toHaveBeenCalledTimes(1);
  });

  it('a provider failure is surfaced, the lease released', async () => {
    const r = parseImport(
      { userId: 'u1', input: csv },
      { runner: runnerOf(new AppError('AI_UNAVAILABLE')).runner, now: NOW },
    );
    expect(await code(r)).toBe('AI_UNAVAILABLE');
    expect(m.release).toHaveBeenCalledTimes(1);
  });

  it('an unmatched school comes back flagged, not guessed', async () => {
    const out = {
      rows: [
        {
          schoolName: 'Springfield Academy of Healing',
          milestones: [{ type: 'SUBMITTED', date: '2026-06-12', raw: '2026-06-12' }],
        },
      ],
    };
    const r = await parseImport({ userId: 'u1', input: csv }, { runner: runnerOf(out).runner, now: NOW });
    // The file never wrote that name, so it is not shown: a neutral label and the picker, never the model's words.
    expect(r.rows[0]).toMatchObject({ school: null, schoolName: '' });
    const written = await parseImport(
      { userId: 'u1', input: { kind: 'paste', text: 'Springfield Academy of Healing submitted 2026-06-12' } },
      { runner: runnerOf(out).runner, now: NOW },
    );
    expect(written.rows[0]).toMatchObject({ school: null, schoolName: 'Springfield Academy of Healing' });
  });

  it('a long paste is cut and the member is told', async () => {
    const paste = `Harvard 2026-06-12\n${'filler 2026-06-12\n'.repeat(5_000)}`;
    const r = await parseImport(
      { userId: 'u1', input: { kind: 'paste', text: paste } },
      { runner: runnerOf(reply).runner, now: NOW },
    );
    expect(r.truncated).toBe(true);
  });

  it('the model sees the file and the response and the logs hold none of it', async () => {
    const essay = 'zzzessay my grandmother tended her garden 2026-06-12';
    const { runner } = runnerOf({
      rows: [
        {
          schoolName: 'Harvard Medical School',
          notes: essay,
          milestones: [{ type: 'SUBMITTED', date: '2026-06-12', raw: '2026-06-12' }],
        },
      ],
    });
    const r = await parseImport(
      { userId: 'u1', input: { kind: 'paste', text: `Harvard Medical School | 2026-06-12\n${essay}` } },
      { runner, now: NOW },
    );
    expect(JSON.stringify(r)).not.toContain('zzzessay');
    for (const l of logs)
      for (const c of l.mock.calls) expect(JSON.stringify(c)).not.toMatch(/zzzessay|Harvard|grandmother|2026-06-12/);
  });
});

describe('an unreadable model reply', () => {
  it("refunds the day's question and ends in AI_UNAVAILABLE", async () => {
    const { runner } = runnerOf(new UnreadableReplyError());
    expect(await code(parseImport({ userId: 'u1', input: csv }, { runner, now: NOW }))).toBe('AI_UNAVAILABLE');
    expect(m.refund).toHaveBeenCalledTimes(1);
    expect(m.release).toHaveBeenCalledTimes(1);
  });

  it('keeps the question for any other failure (the call was made)', async () => {
    const { runner } = runnerOf(new AppError('AI_UNAVAILABLE'));
    expect(await code(parseImport({ userId: 'u1', input: csv }, { runner, now: NOW }))).toBe('AI_UNAVAILABLE');
    expect(m.refund).not.toHaveBeenCalled();
  });
});
