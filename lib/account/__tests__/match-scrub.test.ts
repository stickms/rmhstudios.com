import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * Sprint 09 16: the member's name leaves the match records other players still see (RMHBox game log, RMHType and
 * Altair results), the raw SQL names real tables and columns, and a failing after-erasure step is retried.
 */

const h = vi.hoisted(() => {
  const exec = vi.fn(async (_s: TemplateStringsArray, ..._v: unknown[]) => 1);
  const query = vi.fn(async (_s: TemplateStringsArray, ..._v: unknown[]) => [] as unknown[]);
  const boss = { send: vi.fn(async () => 'job-1') };
  return { exec, query, boss };
});

vi.mock('@/lib/prisma.server', () => ({ prisma: { $executeRaw: h.exec, $queryRaw: h.query } }));
vi.mock('@/lib/cached.server', () => ({ invalidateCached: vi.fn(async () => undefined) }));
vi.mock('@/lib/jobs/boss.server', () => ({ getBoss: vi.fn(async () => h.boss) }));

import {
  scrubAltairMatchResults,
  scrubMatchGameLogs,
  scrubMatchSnapshots,
  scrubNamesInJson,
  scrubTypeMatchResults,
} from '@/lib/account/erasure-games.server';
import {
  AFTER_ERASURE_STEPS,
  afterErasureSendOptions,
  enqueueAfterErasure,
  handleAfterErasureJob,
  runAfterErasureInline,
  runAfterErasureSteps,
} from '@/lib/account/after-erasure-jobs.server';

const U = 'user-1';
const sqlOf = (call: unknown[]) => (call[0] as TemplateStringsArray).join('?');

describe('scrubNamesInJson', () => {
  const log = {
    type: 'wit-war',
    actions: [
      { seq: 1, payload: { userId: U, name: 'Ada', handle: 'ada', score: 7, avatarUrl: 'https://x/ada.png' } },
      { seq: 2, payload: { userId: 'other', name: 'Bo', handle: 'bo', avatarUrl: 'https://x/bo.png' } },
      { seq: 3, payload: { userId: U, displayName: 'Ada L', note: 'Ada said hi' } },
    ],
    standings: [{ userId: U, userName: 'Ada', totalScore: 9 }],
  };

  it('replaces name fields in the member entries only and keeps numbers and order', () => {
    const out = scrubNamesInJson(log, U) as typeof log;
    expect(out.actions[0]!.payload).toEqual({
      userId: U,
      name: 'Deleted user',
      handle: 'Deleted user',
      score: 7,
      avatarUrl: null,
    });
    expect(out.actions[1]).toBe(log.actions[1]);
    expect(out.actions[2]!.payload).toEqual({ userId: U, displayName: 'Deleted user', note: 'Ada said hi' });
    expect(out.standings[0]).toEqual({ userId: U, userName: 'Deleted user', totalScore: 9 });
    expect(out.actions.map((a) => a.seq)).toEqual([1, 2, 3]);
  });

  it('is idempotent: a second pass returns the same reference', () => {
    const once = scrubNamesInJson(log, U);
    expect(scrubNamesInJson(once, U)).toBe(once);
  });

  it('leaves values without the member untouched', () => {
    const other = { standings: [{ userId: 'x', userName: 'X' }] };
    expect(scrubNamesInJson(other, U)).toBe(other);
    expect(scrubNamesInJson(null, U)).toBeNull();
    expect(scrubNamesInJson('Ada', U)).toBe('Ada');
  });
});

describe('the raw SQL', () => {
  it('keeps the ordered snapshot rewrite for rmhbox_match.results', async () => {
    h.exec.mockClear();
    await scrubMatchSnapshots(U);
    const sql = sqlOf(h.exec.mock.calls[0]!);
    expect(sql).toContain('"rmhbox_match"');
    expect(sql).toContain('WITH ORDINALITY');
    expect(sql).toContain('ORDER BY e.ord');
    expect(h.exec.mock.calls[0]!.slice(1)).toEqual([U, 'Deleted user', 'Deleted user', U]);
  });

  it('finds the member through each match-player table by userId, then reads and writes the real columns', async () => {
    const cases: Array<[() => Promise<void>, string, string, string]> = [
      [() => scrubMatchGameLogs(U), 'rmhbox_match_player', 'rmhbox_match', 'gameLog'],
      [() => scrubTypeMatchResults(U), 'rmhtype_match_player', 'rmhtype_match', 'results'],
      [() => scrubAltairMatchResults(U), 'altair_match_player', 'altair_match', 'results'],
    ];
    for (const [run, players, matches, column] of cases) {
      h.query.mockReset();
      h.exec.mockClear();
      h.query
        .mockResolvedValueOnce([{ matchId: 'm1' }])
        .mockResolvedValueOnce([{ id: 'm1', doc: { players: [{ userId: U, userName: 'Ada', kills: 3 }] } }]);
      await run();
      const first = h.query.mock.calls[0]!;
      expect(sqlOf(first)).toContain(`"${players}"`);
      expect(sqlOf(first)).toContain('"userId" = ?');
      expect(first.slice(1)).toEqual([U]);
      const read = sqlOf(h.query.mock.calls[1]!);
      expect(read).toContain(`"${matches}"`);
      expect(read).toContain(`"${column}"`);
      const write = h.exec.mock.calls[0]!;
      expect(sqlOf(write)).toContain(`UPDATE "${matches}" SET "${column}"`);
      expect(JSON.parse(write[1] as string)).toEqual({ players: [{ userId: U, userName: 'Deleted user', kills: 3 }] });
      expect(write[2]).toBe('m1');
    }
  });

  it('writes nothing on a re-run over rows that are already scrubbed', async () => {
    h.query.mockReset();
    h.exec.mockClear();
    h.query
      .mockResolvedValueOnce([{ matchId: 'm1' }])
      .mockResolvedValueOnce([{ id: 'm1', doc: { players: [{ userId: U, userName: 'Deleted user' }] } }]);
    await scrubTypeMatchResults(U);
    expect(h.exec).not.toHaveBeenCalled();
  });

  it('names columns that exist in the schema', () => {
    const rmhbox = readFileSync('prisma/schema/games/rmhbox.prisma', 'utf8');
    expect(rmhbox).toMatch(/gameLog\s+Json\?/);
    expect(rmhbox).toContain('@@map("rmhbox_match_player")');
    expect(readFileSync('prisma/schema/rmhtype.prisma', 'utf8')).toContain('@@map("rmhtype_match_player")');
    expect(readFileSync('prisma/schema/games/altair.prisma', 'utf8')).toContain('@@map("altair_match_player")');
  });
});

describe('the after-erasure job', () => {
  it('runs every step, continues past a failure and names only the failed step', async () => {
    const calls: string[] = [];
    const steps = [
      {
        name: 'a',
        run: async () => {
          calls.push('a');
          throw new Error('boom user-1');
        },
      },
      { name: 'b', run: async () => void calls.push('b') },
    ];
    expect(await runAfterErasureSteps(U, steps)).toEqual(['a']);
    expect(calls).toEqual(['a', 'b']);
  });

  it('a step that fails once succeeds on the retry, and the retry throws only while a step still fails', async () => {
    let fails = 1;
    const steps = [
      {
        name: 'match-snapshots',
        run: async () => {
          if (fails-- > 0) throw new Error('db down');
        },
      },
    ];
    await expect(handleAfterErasureJob({ data: { userId: U }, retryCount: 0, retryLimit: 5 }, steps)).rejects.toThrow(
      'match-snapshots',
    );
    await expect(
      handleAfterErasureJob({ data: { userId: U }, retryCount: 1, retryLimit: 5 }, steps),
    ).resolves.toBeUndefined();
  });

  it('logs the step name, never the member, when the last retry fails', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const steps = [
      {
        name: 'match-game-logs',
        run: async () => {
          throw new Error('x');
        },
      },
    ];
    await expect(handleAfterErasureJob({ data: { userId: U }, retryCount: 5, retryLimit: 5 }, steps)).rejects.toThrow();
    const logged = err.mock.calls.map((c) => String(c[0])).join('\n');
    expect(logged).toContain('match-game-logs');
    expect(logged).not.toContain(U);
    err.mockRestore();
  });

  it('enqueues, once per member with backoff, only when an inline step threw', async () => {
    h.boss.send.mockClear();
    await runAfterErasureInline(U);
    expect(h.boss.send).not.toHaveBeenCalled();
    expect(await enqueueAfterErasure(U, ['x'])).toBe(true);
    expect(h.boss.send).toHaveBeenCalledWith('account.after-erasure', { userId: U }, afterErasureSendOptions(U));
    expect(afterErasureSendOptions(U)).toMatchObject({ singletonKey: `after-erasure:${U}`, retryBackoff: true });
  });

  it('covers every after-transaction step', () => {
    expect(AFTER_ERASURE_STEPS.map((s) => s.name)).toEqual([
      'learner-board-caches',
      'game-board-caches',
      'match-snapshots',
      'match-game-logs',
      'type-match-results',
      'altair-match-results',
    ]);
  });
});
