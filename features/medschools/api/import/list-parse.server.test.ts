import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  release: vi.fn(async () => undefined),
  refund: vi.fn(async () => undefined),
  admitQuestion: vi.fn(),
}));
vi.mock('../qa/budget.server', () => ({ admitQuestion: m.admitQuestion }));
// The real runners import the provider (and Prisma); the tests pass their own.
vi.mock('./runner.server', () => ({ aiImportRunner: {}, aiListImportRunner: {} }));
const DIR = [
  { slug: 'harvard', name: 'Harvard Medical School', shortName: 'Harvard', state: 'MA', interviewFormat: null, degree: 'MD' },
  { slug: 'ucsf', name: 'University of California, San Francisco School of Medicine', shortName: 'UCSF', state: 'CA', interviewFormat: null, degree: 'MD' },
];
const d = vi.hoisted(() => ({
  importDirectory: vi.fn(async (_opts?: { fresh?: boolean }) => ({ dir: [] as unknown[], aliases: new Map() })),
}));
vi.mock('./directory.server', () => ({ importDirectory: d.importDirectory }));

import { MEDSCHOOLS_IMPORT, MEDSCHOOLS_LIST_IMPORT, SAFETY_FRAME } from '@/lib/ai/prompts';
import { AppError } from '@/lib/errors/codes';
import { parseListImport } from './list-parse.server';
import { UnreadableReplyError } from './unreadable';
import type { ImportRunner } from './runner.server';

const ESSAY = 'zebraquill-essay-sentence';
const TEXT = `Schools I like\nHarvard Medical School | MD-PhD\nUCSF\n${ESSAY}`;
const paste = { kind: 'paste' as const, text: TEXT };
const gate = { tier: 'free', remainingToday: 24, dailyCap: 25, release: m.release, refund: m.refund };
const reply = {
  schools: [
    { name: 'Harvard Medical School', program: 'MD-PhD' },
    { name: 'UCSF', program: '' },
    { name: 'Stanford', program: 'MD' },
  ],
  notes: ESSAY,
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
  d.importDirectory.mockReset();
  d.importDirectory.mockImplementation(async () => ({ dir: DIR, aliases: new Map() }));
  logs = (['log', 'warn', 'error', 'info'] as const).map((k) => vi.spyOn(console, k).mockImplementation(() => undefined));
});
afterEach(() => vi.restoreAllMocks());

describe('parseListImport', () => {
  it('reads pasted text into school rows with ONE model call under the list prompt and the injection frame', async () => {
    const { runner, calls } = runnerOf(reply);
    const r = await parseListImport({ userId: 'u1', input: paste }, { runner });
    expect(r.rows.map((x) => [x.school?.slug, x.program])).toEqual([
      ['harvard', 'PHD'],
      ['ucsf', 'ANY'],
    ]);
    expect(r).toMatchObject({ dropped: 1, truncated: false, tier: 'free', remainingToday: 24, dailyCap: 25 });
    expect(calls).toHaveLength(1);
    const [system, user] = calls[0]!;
    expect(system).toContain(SAFETY_FRAME);
    expect(system).toContain(MEDSCHOOLS_LIST_IMPORT.instructions);
    expect(system).not.toContain(MEDSCHOOLS_IMPORT.instructions);
    expect(user).toContain('Harvard Medical School | MD-PhD');
    // The model's note reaches nothing.
    expect(JSON.stringify(r)).not.toContain(ESSAY);
    expect(m.admitQuestion).toHaveBeenCalledTimes(1);
  });

  it('reads an uploaded file through the tracker import reader', async () => {
    const file = { kind: 'file' as const, buffer: Buffer.from(TEXT), mimeType: 'text/csv', filename: 'list.csv' };
    const r = await parseListImport({ userId: 'u1', input: file }, { runner: runnerOf(reply).runner });
    expect(r.rows.map((x) => x.school?.slug)).toEqual(['harvard', 'ucsf']);
  });

  it('a text with no words is refused as empty before any gate or model call', async () => {
    const { runner, calls } = runnerOf(reply);
    expect(await code(parseListImport({ userId: 'u1', input: { kind: 'paste', text: '12 | 3.4 | -- ' } }, { runner }))).toBe(
      'MEDSCHOOLS_LIST_IMPORT_EMPTY',
    );
    expect(m.admitQuestion).not.toHaveBeenCalled();
    expect(calls).toHaveLength(0);
  });

  it('names a list text holds need no digit (the tracker rule is not applied)', async () => {
    const r = await parseListImport({ userId: 'u1', input: { kind: 'paste', text: 'Harvard' } }, {
      runner: runnerOf({ schools: [{ name: 'Harvard' }] }).runner,
    });
    expect(r.rows).toHaveLength(1);
  });

  it('nothing the text holds is a school: empty, after the call (the question is spent)', async () => {
    const r = parseListImport({ userId: 'u1', input: paste }, { runner: runnerOf({ schools: [{ name: 'Stanford' }] }).runner });
    expect(await code(r)).toBe('MEDSCHOOLS_LIST_IMPORT_EMPTY');
    expect(m.refund).not.toHaveBeenCalled();
  });

  it('a gate refusal stops it before the model call', async () => {
    m.admitQuestion.mockRejectedValue(new AppError('MEDSCHOOLS_QA_DAILY_CAP'));
    const { runner, calls } = runnerOf(reply);
    expect(await code(parseListImport({ userId: 'u1', input: paste }, { runner }))).toBe('MEDSCHOOLS_QA_DAILY_CAP');
    expect(calls).toHaveLength(0);
  });

  it('an unreadable reply refunds the question; a provider failure does not', async () => {
    expect(
      await code(parseListImport({ userId: 'u1', input: paste }, { runner: runnerOf(new UnreadableReplyError()).runner })),
    ).toBe('AI_UNAVAILABLE');
    expect(m.refund).toHaveBeenCalledTimes(1);
    m.refund.mockClear();
    expect(
      await code(parseListImport({ userId: 'u1', input: paste }, { runner: runnerOf(new AppError('AI_UNAVAILABLE')).runner })),
    ).toBe('AI_UNAVAILABLE');
    expect(m.refund).not.toHaveBeenCalled();
  });

  it('an unmatched name looks the directory up once more, fresh', async () => {
    d.importDirectory.mockImplementation(async (opts?: { fresh?: boolean }) => ({
      dir: opts?.fresh ? DIR : DIR.filter((s) => s.slug !== 'ucsf'),
      aliases: new Map(),
    }));
    const r = await parseListImport({ userId: 'u1', input: paste }, { runner: runnerOf(reply).runner });
    expect(r.rows.map((x) => x.school?.slug)).toEqual(['harvard', 'ucsf']);
    expect(d.importDirectory).toHaveBeenLastCalledWith({ fresh: true });
  });

  it('logs counts and a status only, never the text, a name or the reply', async () => {
    await parseListImport({ userId: 'u1', input: paste }, { runner: runnerOf(reply).runner });
    const seen = JSON.stringify(logs.map((l) => l.mock.calls));
    for (const needle of [ESSAY, 'Harvard', 'UCSF', 'Stanford', 'Schools I like']) expect(seen).not.toContain(needle);
    expect(seen).toContain('list-ok');
  });
});
