import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Daily Puzzle replay verification (P4).
 *
 * `POST /api/daily-puzzles/score` has always written down whatever score the
 * browser sent, so these leaderboards were a record of claims. This verifier
 * re-derives the score from the stored puzzle, and the tests that matter are
 * the forgeries: a log that says it solved something it did not, a log that
 * keeps playing after it won, a ranking that names an item twice.
 */

const prismaMock = vi.hoisted(() => ({
  dailyPuzzle: { findUnique: vi.fn() },
}));
vi.mock('@/lib/prisma.server', () => ({ prisma: prismaMock }));

import { verifyDailyPuzzle } from '@/lib/daily-puzzles/replay.server';
import { replayScoreIsTrusted, getReplayable } from '@/lib/game/replay';

const DATE = '2026-09-19';

function puzzle(data: unknown) {
  prismaMock.dailyPuzzle.findUnique.mockResolvedValue({ data });
}

beforeEach(() => {
  prismaMock.dailyPuzzle.findUnique.mockReset();
});

describe('the registry', () => {
  it('treats the daily puzzle as trusted, because a verifier really does exist', () => {
    expect(replayScoreIsTrusted(getReplayable('daily-puzzle'))).toBe(true);
  });

  it('treats an unknown game as untrusted', () => {
    expect(replayScoreIsTrusted(getReplayable('no-such-game'))).toBe(false);
  });

  it('treats a keyframe game as untrusted even with a verifier attached', () => {
    expect(
      replayScoreIsTrusted({
        game: 'x',
        version: 'v1',
        kind: 'keyframe',
        schema: { safeParse: () => ({ success: true }) } as never,
        verify: () => ({ score: 999 }),
      }),
    ).toBe(false);
  });
});

describe('verifyDailyPuzzle — the puzzle must exist', () => {
  it('refuses when there is no row for that day', async () => {
    prismaMock.dailyPuzzle.findUnique.mockResolvedValue(null);
    expect(
      await verifyDailyPuzzle({ mode: 'alibi', dateKey: DATE, inputs: ['Ada'], timeSeconds: 10 }),
    ).toBeNull();
  });

  it('refuses a malformed payload without touching the database', async () => {
    expect(await verifyDailyPuzzle({ mode: 'nope', dateKey: DATE, inputs: [] })).toBeNull();
    expect(prismaMock.dailyPuzzle.findUnique).not.toHaveBeenCalled();
  });
});

describe('alibi', () => {
  const solved = { _solution: { guiltyName: 'Ada' } };

  it('scores a first-guess solve', async () => {
    puzzle(solved);
    const r = await verifyDailyPuzzle({ mode: 'alibi', dateKey: DATE, inputs: ['Ada'], timeSeconds: 0 });
    expect(r).toEqual({ score: 150 }); // 100 base + 50 time bonus
  });

  it('scores a second-guess solve lower', async () => {
    puzzle(solved);
    const r = await verifyDailyPuzzle({
      mode: 'alibi',
      dateKey: DATE,
      inputs: ['Bob', 'Ada'],
      timeSeconds: 0,
    });
    expect(r).toEqual({ score: 75 }); // 50 base + 25 cap
  });

  it('gives nothing for a run that never found them', async () => {
    puzzle(solved);
    const r = await verifyDailyPuzzle({
      mode: 'alibi',
      dateKey: DATE,
      inputs: ['Bob', 'Cy'],
      timeSeconds: 0,
    });
    expect(r).toEqual({ score: 0 });
  });

  it('erodes the time bonus', async () => {
    puzzle(solved);
    const r = await verifyDailyPuzzle({ mode: 'alibi', dateKey: DATE, inputs: ['Ada'], timeSeconds: 60 });
    expect(r).toEqual({ score: 130 }); // 100 + (50 - 20)
  });

  it('refuses a log that keeps playing after it won', async () => {
    // The forgery: claim the first guess was right AND submit a second, so the
    // run reads as a one-guess solve while covering a wrong first answer.
    puzzle(solved);
    expect(
      await verifyDailyPuzzle({ mode: 'alibi', dateKey: DATE, inputs: ['Ada', 'Bob'], timeSeconds: 0 }),
    ).toBeNull();
  });

  it('refuses more guesses than the game allows', async () => {
    puzzle(solved);
    expect(
      await verifyDailyPuzzle({ mode: 'alibi', dateKey: DATE, inputs: ['a', 'b', 'c'], timeSeconds: 0 }),
    ).toBeNull();
  });
});

describe('outcast', () => {
  const rounds = ['A', 'B', 'C', 'D', 'E'].map((n) => ({ _solution: { outcastName: n } }));

  it('scores a perfect run with the streak bonus', async () => {
    puzzle({ rounds });
    const r = await verifyDailyPuzzle({
      mode: 'outcast',
      dateKey: DATE,
      inputs: ['A', 'B', 'C', 'D', 'E'],
      timeSeconds: 0,
    });
    expect(r).toEqual({ score: 175 }); // 10+20+30+40+50 + 25
  });

  it('scores a partial run without it', async () => {
    puzzle({ rounds });
    const r = await verifyDailyPuzzle({
      mode: 'outcast',
      dateKey: DATE,
      inputs: ['A', 'B', 'C', 'D', 'X'],
      timeSeconds: 0,
    });
    expect(r).toEqual({ score: 100 });
  });

  it('refuses a log that does not have one guess per round', async () => {
    puzzle({ rounds });
    expect(
      await verifyDailyPuzzle({ mode: 'outcast', dateKey: DATE, inputs: ['A', 'B'], timeSeconds: 0 }),
    ).toBeNull();
  });
});

describe('spectrum', () => {
  const solution = [
    { name: 'a', trueRank: 1 },
    { name: 'b', trueRank: 2 },
    { name: 'c', trueRank: 3 },
    { name: 'd', trueRank: 4 },
    { name: 'e', trueRank: 5 },
  ];

  it('scores a perfect ordering', async () => {
    puzzle({ _solution: solution });
    const r = await verifyDailyPuzzle({
      mode: 'spectrum',
      dateKey: DATE,
      inputs: ['a', 'b', 'c', 'd', 'e'],
      timeSeconds: 0,
    });
    expect(r).toEqual({ score: 150 });
  });

  it('refuses a ranking that names one item twice', async () => {
    // Otherwise a player could rank their best guess into several slots.
    puzzle({ _solution: solution });
    expect(
      await verifyDailyPuzzle({
        mode: 'spectrum',
        dateKey: DATE,
        inputs: ['a', 'a', 'c', 'd', 'e'],
        timeSeconds: 0,
      }),
    ).toBeNull();
  });

  it('refuses a ranking naming something not in the puzzle', async () => {
    puzzle({ _solution: solution });
    expect(
      await verifyDailyPuzzle({
        mode: 'spectrum',
        dateKey: DATE,
        inputs: ['a', 'b', 'c', 'd', 'zzz'],
        timeSeconds: 0,
      }),
    ).toBeNull();
  });
});

describe('chainlink', () => {
  it('refuses a chain that does not start and end where the puzzle says', async () => {
    puzzle({ startWord: 'sun', endWord: 'moon' });
    expect(
      await verifyDailyPuzzle({
        mode: 'chainlink',
        dateKey: DATE,
        inputs: ['sun', 'sky', 'star'],
        timeSeconds: 0,
      }),
    ).toBeNull();
  });

  it('scores an invalid chain zero rather than refusing it', async () => {
    // An unlinked chain is a thing a player can really submit, so it is a score
    // of nothing — not a verification failure, which would read as tampering.
    puzzle({ startWord: 'sun', endWord: 'moon' });
    const r = await verifyDailyPuzzle({
      mode: 'chainlink',
      dateKey: DATE,
      inputs: ['sun', 'qqqq', 'moon'],
      timeSeconds: 0,
    });
    expect(r).toEqual({ score: 0 });
  });
});

describe('impostor', () => {
  const p = {
    _solution: [
      { text: 'fake one', isFake: true },
      { text: 'fake two', isFake: true },
      { text: 'true one', isFake: false },
    ],
  };

  it('scores both found on the first guess highest', async () => {
    puzzle(p);
    const r = await verifyDailyPuzzle({
      mode: 'impostor',
      dateKey: DATE,
      inputs: [['fake one', 'fake two']],
      timeSeconds: 0,
    });
    expect(r).toEqual({ score: 100 });
  });

  it('scores both found across two guesses lower', async () => {
    puzzle(p);
    const r = await verifyDailyPuzzle({
      mode: 'impostor',
      dateKey: DATE,
      inputs: [['fake one', 'true one'], ['fake two']],
      timeSeconds: 0,
    });
    expect(r).toEqual({ score: 50 });
  });

  it('scores one found', async () => {
    puzzle(p);
    const r = await verifyDailyPuzzle({
      mode: 'impostor',
      dateKey: DATE,
      inputs: [['fake one', 'true one']],
      timeSeconds: 0,
    });
    expect(r).toEqual({ score: 20 });
  });

  it('gives nothing for a run that found neither', async () => {
    puzzle(p);
    const r = await verifyDailyPuzzle({
      mode: 'impostor',
      dateKey: DATE,
      inputs: [['true one']],
      timeSeconds: 0,
    });
    expect(r).toEqual({ score: 0 });
  });
});
