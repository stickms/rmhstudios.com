import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * RMHType saved texts (s10-05): ownership, the 50-text cap under its lock, the record a body edit resets, the
 * bests (compare-and-set), the 50-run trim and the ghost. Prisma is a small in-memory fake; nothing touches a
 * database.
 */

interface TextRow {
  id: string;
  userId: string;
  title: string;
  body: string;
  bestWpm: number | null;
  bestAccuracy: number | null;
  runs: number;
  lastRunAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
interface RunRow {
  id: string;
  textId: string;
  userId: string;
  wpm: number;
  accuracy: number;
  timeMs: number;
  createdAt: Date;
}

const state = vi.hoisted(() => ({
  texts: [] as unknown[],
  runs: [] as unknown[],
  ghosts: [] as Array<{ userId: string; passageId: string }>,
  clock: 0,
  seq: 0,
  ghostCalls: [] as unknown[],
}));

type Where = Record<string, unknown>;

/** Just enough of Prisma's `where`: equality, `{ in }`, `{ lt }`, `null` and `OR`. */
function matches(row: Record<string, unknown>, where: Where | undefined): boolean {
  if (!where) return true;
  return Object.entries(where).every(([key, cond]) => {
    if (key === 'OR') return (cond as Where[]).some((w) => matches(row, w));
    const value = row[key];
    if (cond === null) return value === null;
    if (cond && typeof cond === 'object' && 'in' in cond) return (cond as { in: unknown[] }).in.includes(value);
    if (cond && typeof cond === 'object' && 'lt' in cond)
      return value !== null && (value as number) < (cond as { lt: number }).lt;
    return value === cond;
  });
}

const prismaMock = vi.hoisted(() => {
  const texts = () => state.texts as TextRow[];
  const runs = () => state.runs as RunRow[];
  const tick = () => new Date(1_700_000_000_000 + ++state.clock);
  const db = {
    $transaction: async (fn: (tx: unknown) => unknown) => fn(db),
    rmhTypeText: {
      findMany: async ({ where }: { where: Where }) =>
        texts()
          .filter((r) => matches(r as never, where))
          .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()),
      findFirst: async ({ where }: { where: Where }) => texts().find((r) => matches(r as never, where)) ?? null,
      count: async ({ where }: { where: Where }) => texts().filter((r) => matches(r as never, where)).length,
      create: async ({ data }: { data: Partial<TextRow> }) => {
        const row = {
          bestWpm: null,
          bestAccuracy: null,
          runs: 0,
          lastRunAt: null,
          ...data,
          id: `t${++state.seq}`,
          createdAt: tick(),
          updatedAt: tick(),
        } as TextRow;
        texts().push(row);
        return row;
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = texts().find((r) => r.id === where.id)!;
        for (const [k, v] of Object.entries(data)) {
          if (v && typeof v === 'object' && 'increment' in v)
            (row as never as Record<string, number>)[k]! += (v as { increment: number }).increment;
          else (row as never as Record<string, unknown>)[k] = v;
        }
        row.updatedAt = tick();
        return row;
      },
      updateMany: async ({ where, data }: { where: Where; data: Record<string, unknown> }) => {
        const hit = texts().filter((r) => matches(r as never, where));
        for (const row of hit) Object.assign(row, data);
        return { count: hit.length };
      },
      deleteMany: async ({ where }: { where: Where }) => {
        const keep = texts().filter((r) => !matches(r as never, where));
        const count = texts().length - keep.length;
        state.texts = keep;
        return { count };
      },
    },
    rmhTypeTextRun: {
      create: async ({ data }: { data: Partial<RunRow> }) => {
        const row = { ...data, id: `r${++state.seq}`, createdAt: tick() } as RunRow;
        runs().push(row);
        return row;
      },
      findMany: async ({ where, skip = 0, take }: { where: Where; skip?: number; take?: number }) =>
        runs()
          .filter((r) => matches(r as never, where))
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || (a.id < b.id ? 1 : -1))
          .slice(skip, take === undefined ? undefined : skip + take),
      deleteMany: async ({ where }: { where: Where }) => {
        const keep = runs().filter((r) => !matches(r as never, where));
        const count = runs().length - keep.length;
        state.runs = keep;
        return { count };
      },
    },
    rmhTypeGhost: {
      deleteMany: async ({ where }: { where: { userId: string; passageId: string } }) => {
        state.ghosts = state.ghosts.filter((g) => !(g.userId === where.userId && g.passageId === where.passageId));
        return { count: 0 };
      },
    },
  };
  return db;
});

vi.mock('@/lib/prisma.server', () => ({ prisma: prismaMock }));
vi.mock('@/lib/db/advisory-lock.server', () => ({ lockKey: vi.fn(async () => undefined) }));
vi.mock('@/lib/rmhtype/ghost-save.server', () => ({
  saveGhostIfBest: vi.fn(async (_db: unknown, run: unknown) => {
    state.ghostCalls.push(run);
    return 'saved';
  }),
}));

import { lockKey } from '@/lib/db/advisory-lock.server';
import {
  createText,
  deleteText,
  exportRmhTypeTexts,
  getText,
  listTexts,
  ownsText,
  recordTextRun,
  typeTextErasureOps,
  updateText,
} from '@/lib/rmhtype/texts.server';
import { MAX_RUNS_PER_TEXT, MAX_TEXTS_PER_MEMBER } from '@/lib/rmhtype/texts';
import { textIdFromPassage, textPassageId } from '@/lib/rmhtype/ghost';

const BODY = 'The quick brown fox jumps over the lazy dog.';
const run = (over: Partial<{ wpm: number; accuracy: number; timeMs: number; typedLength: number }> = {}) => ({
  wpm: 60,
  accuracy: 97,
  timeMs: 5_000,
  typedLength: BODY.length,
  ...over,
});

async function make(userId = 'u1', title = 'Fox', body = BODY) {
  const made = await createText(userId, { title, body });
  if (!made.ok) throw new Error('create failed');
  return made.text.id;
}

beforeEach(() => {
  state.texts = [];
  state.runs = [];
  state.ghosts = [];
  state.clock = 0;
  state.seq = 0;
  state.ghostCalls = [];
  vi.mocked(lockKey).mockClear();
});

describe('saved texts: the cap', () => {
  it('takes the per-member lock and refuses the 51st text', async () => {
    for (let i = 0; i < MAX_TEXTS_PER_MEMBER; i++) await make('u1', `Text ${i}`);
    expect(state.texts).toHaveLength(MAX_TEXTS_PER_MEMBER);
    const over = await createText('u1', { title: 'One more', body: BODY });
    expect(over).toEqual({ ok: false, reason: 'cap' });
    expect(state.texts).toHaveLength(MAX_TEXTS_PER_MEMBER);
    expect(lockKey).toHaveBeenCalledWith(expect.anything(), 'rmhtype-texts:u1');
    // The cap is per member.
    expect((await createText('u2', { title: 'Mine', body: BODY })).ok).toBe(true);
  });

  it('refuses a body or title the rules refuse, before the lock', async () => {
    expect(await createText('u1', { title: 'Short', body: 'too short' })).toEqual({ ok: false, reason: 'invalid' });
    expect(await createText('u1', { title: '   ', body: BODY })).toEqual({ ok: false, reason: 'invalid' });
    expect(lockKey).not.toHaveBeenCalled();
  });
});

describe('saved texts: ownership', () => {
  it("another member's text is not found by any path", async () => {
    const id = await make('u1');
    expect(await getText('u2', id)).toBeNull();
    expect(await updateText('u2', id, { title: 'Mine now' })).toEqual({ ok: false, reason: 'not-found' });
    expect(await deleteText('u2', id)).toBe(false);
    expect(await recordTextRun('u2', id, run())).toEqual({ ok: false, reason: 'not-found' });
    expect(await ownsText('u2', id)).toBe(false);
    expect(await ownsText('u1', id)).toBe(true);
    expect(await listTexts('u2')).toEqual([]);
    expect(state.runs).toHaveLength(0);
    expect(state.texts).toHaveLength(1);
  });
});

describe('saved texts: editing', () => {
  it('a changed body resets the bests, the run count and last run, and deletes the runs and the ghost', async () => {
    const id = await make();
    await recordTextRun('u1', id, run());
    await recordTextRun('u1', id, run({ wpm: 70 }));
    state.ghosts.push({ userId: 'u1', passageId: textPassageId(id) }, { userId: 'u1', passageId: 'other-passage' });

    const edited = await updateText('u1', id, { body: `${BODY} It was a bright day.` });
    expect(edited).toMatchObject({ ok: true, reset: true });
    expect(edited.ok && edited.text).toMatchObject({ bestWpm: null, bestAccuracy: null, runs: 0, lastRunAt: null });
    expect(state.runs).toHaveLength(0);
    // Only this text's ghost goes; a passage ghost stays.
    expect(state.ghosts).toEqual([{ userId: 'u1', passageId: 'other-passage' }]);
  });

  it('a rename, or the same body, keeps the record', async () => {
    const id = await make();
    await recordTextRun('u1', id, run());
    const renamed = await updateText('u1', id, { title: '  The fox  ' });
    expect(renamed).toMatchObject({ ok: true, reset: false });
    expect(renamed.ok && renamed.text).toMatchObject({ title: 'The fox', bestWpm: 60, runs: 1 });
    const same = await updateText('u1', id, { body: `${BODY}\r\n`.trim() });
    expect(same).toMatchObject({ ok: true, reset: false });
    expect(state.runs).toHaveLength(1);
  });

  it('delete removes the text, its runs and its ghost', async () => {
    const id = await make();
    await recordTextRun('u1', id, run());
    state.ghosts.push({ userId: 'u1', passageId: textPassageId(id) });
    expect(await deleteText('u1', id)).toBe(true);
    expect(state.texts).toHaveLength(0);
    expect(state.ghosts).toHaveLength(0);
  });
});

describe('saved texts: runs', () => {
  it('updates each best only when the run is better, and counts every run', async () => {
    const id = await make();
    const first = await recordTextRun('u1', id, run({ wpm: 60, accuracy: 97 }));
    expect(first).toMatchObject({ ok: true, newBest: true });
    const slower = await recordTextRun('u1', id, run({ wpm: 50, accuracy: 99 }));
    expect(slower).toMatchObject({ ok: true, newBest: false });
    expect(slower.ok && slower.text).toMatchObject({ bestWpm: 60, bestAccuracy: 99, runs: 2 });
    const faster = await recordTextRun('u1', id, run({ wpm: 80, accuracy: 90 }));
    expect(faster.ok && faster.text).toMatchObject({ bestWpm: 80, bestAccuracy: 99, runs: 3 });
    const equal = await recordTextRun('u1', id, run({ wpm: 80, accuracy: 90 }));
    expect(equal).toMatchObject({ ok: true, newBest: false });
  });

  it('keeps the newest 50 runs per text and returns them oldest first', async () => {
    const id = await make();
    const other = await make('u1', 'Other');
    await recordTextRun('u1', other, run());
    for (let i = 0; i < MAX_RUNS_PER_TEXT + 5; i++) await recordTextRun('u1', id, run({ wpm: 20 + i }));
    const mine = (state.runs as RunRow[]).filter((r) => r.textId === id);
    expect(mine).toHaveLength(MAX_RUNS_PER_TEXT);
    // The oldest five (20..24 wpm) are gone; the other text's run is untouched.
    expect(Math.min(...mine.map((r) => r.wpm))).toBe(25);
    expect((state.runs as RunRow[]).filter((r) => r.textId === other)).toHaveLength(1);
    const found = await getText('u1', id);
    expect(found?.runs).toHaveLength(MAX_RUNS_PER_TEXT);
    expect(found?.runs[0]?.wpm).toBe(25);
    expect(found?.runs.at(-1)?.wpm).toBe(20 + MAX_RUNS_PER_TEXT + 4);
    expect(found?.text.runs).toBe(MAX_RUNS_PER_TEXT + 5);
  });

  it('re-checks the figures against the stored body and writes nothing for a bad run', async () => {
    const id = await make();
    for (const bad of [
      run({ wpm: 251 }),
      run({ wpm: -1 }),
      run({ accuracy: 100.5 }),
      run({ accuracy: -1 }),
      run({ timeMs: 0 }),
      run({ typedLength: BODY.length + 1 }),
      run({ wpm: Number.NaN }),
    ]) {
      expect(await recordTextRun('u1', id, bad)).toEqual({ ok: false, reason: 'invalid' });
    }
    expect(state.runs).toHaveLength(0);
    expect((state.texts as TextRow[])[0]).toMatchObject({ runs: 0, bestWpm: null });
  });

  it('keeps the curve as the ghost under text:<id>, through the shared save, and none without a curve', async () => {
    const id = await make();
    const samples = [10, 20, BODY.length];
    const saved = await recordTextRun('u1', id, { ...run(), samples });
    expect(saved).toMatchObject({ ok: true, ghost: 'saved' });
    expect(state.ghostCalls).toEqual([
      expect.objectContaining({
        userId: 'u1',
        passageId: `text:${id}`,
        aiPassage: false,
        passageLength: BODY.length,
        wpm: 60,
        timeMs: 5_000,
        samples,
      }),
    ]);
    const bare = await recordTextRun('u1', id, run());
    expect(bare).toMatchObject({ ok: true, ghost: 'none' });
    expect(state.ghostCalls).toHaveLength(1);
  });
});

describe('saved texts: reaches nothing else', () => {
  const root = path.resolve(__dirname, '../../..');
  const imports = (file: string) =>
    [...readFileSync(path.join(root, file), 'utf8').matchAll(/from '([^']+)'/g)].map((m) => m[1]!);

  it('the server module and the run endpoint import no writer for XP, streaks, boards, profiles or achievements', () => {
    for (const file of ['lib/rmhtype/texts.server.ts', 'lib/rmhtype/api/rmhtype.texts.$textId.runs.server.ts']) {
      const offenders = imports(file).filter((spec) =>
        /xp|streak|achievement|daily|leaderboard|profile|economy|progress\.server/i.test(spec),
      );
      expect(offenders, file).toEqual([]);
    }
  });

  it('the ghost endpoint checks a text: passage belongs to the caller before reading it', () => {
    const source = readFileSync(path.join(root, 'lib/rmhtype/api/rmhtype.ghosts.$passageId.server.ts'), 'utf8');
    expect(source).toContain('textIdFromPassage');
    expect(source).toMatch(/ownsText\(userId, textId\)/);
    expect(source.indexOf('ownsText')).toBeLessThan(source.indexOf('getGhost(userId'));
  });

  it('text passage ids round-trip and nothing else parses as one', () => {
    expect(textIdFromPassage(textPassageId('abc'))).toBe('abc');
    expect(textIdFromPassage('text:')).toBeNull();
    expect(textIdFromPassage('standard-12')).toBeNull();
    expect(textIdFromPassage('custom-practice')).toBeNull();
  });
});

describe('saved texts: export and erasure', () => {
  it('exports the texts with their runs, and only the member’s own', async () => {
    const id = await make();
    await recordTextRun('u1', id, run());
    await make('u2', 'Not mine');
    const out = await exportRmhTypeTexts('u1');
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ title: 'Fox', body: BODY, bestWpm: 60, runs: 1 });
    expect(out[0]?.recentRuns).toHaveLength(1);
    expect(out[0]).not.toHaveProperty('id');
  });

  it('erasure deletes the runs and the texts by user id', () => {
    const calls: string[] = [];
    const spy = (model: string) =>
      vi
        .spyOn((prismaMock as never as Record<string, { deleteMany: () => unknown }>)[model]!, 'deleteMany')
        .mockImplementation((() => {
          calls.push(model);
          return Promise.resolve({ count: 0 });
        }) as never);
    spy('rmhTypeTextRun');
    spy('rmhTypeText');
    typeTextErasureOps('u1');
    expect(calls).toEqual(['rmhTypeTextRun', 'rmhTypeText']);
  });
});
