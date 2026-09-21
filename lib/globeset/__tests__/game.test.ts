/**
 * The run: the deal, the transitions, the score, and what the share card says.
 *
 * The deal is asserted hard because it is the whole promise of a daily puzzle —
 * "the same puzzle for everyone, everywhere" is a claim about a pure function,
 * and a shuffle that drifted with the engine, the timezone or the build would
 * break it silently and only for some players.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DECK_SIZE, BOARD_SIZE, xorAll, isGlobeSet, fullDeck } from '@/lib/globeset/cards';
import { findSmallestGlobeSet } from '@/lib/globeset/solver';
import {
  dealForDate,
  dealFromSeed,
  seedFromDateKey,
  createRun,
  submitSelection,
  takeHint,
  applySolverStep,
  cardsRemaining,
  runProgress,
  summarise,
  scoreRun,
  formatDuration,
  PAR_SECONDS,
} from '@/lib/globeset/game';
import {
  generateGlobeSetShare,
  generateRaceShare,
  shareGrid,
  accuracy,
} from '@/lib/globeset/share';
import { EVENTS } from '@/lib/globeset/net/events';
import {
  loadRun,
  saveRun,
  clearRun,
  loadStats,
  recordCompletion,
  snapshotMatchesDeck,
  streakFrom,
} from '@/lib/globeset/persistence';

describe('the daily deal', () => {
  it('is the full deck, permuted', () => {
    const deck = dealForDate('2026-09-20');
    expect(deck).toHaveLength(DECK_SIZE);
    expect([...deck].sort((a, b) => a - b)).toEqual(fullDeck());
  });

  it('is the same every time it is asked for', () => {
    for (const dateKey of ['2026-01-01', '2026-09-20', '2027-12-31']) {
      expect(dealForDate(dateKey)).toEqual(dealForDate(dateKey));
    }
  });

  it('differs from day to day', () => {
    const a = dealForDate('2026-09-20');
    const b = dealForDate('2026-09-21');
    expect(a).not.toEqual(b);
  });

  it('does not depend on the machine clock or its timezone', () => {
    const before = dealForDate('2026-09-20');
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2030-02-14T23:59:59Z'));
    const after = dealForDate('2026-09-20');
    vi.useRealTimers();
    expect(after).toEqual(before);
  });

  it('is not the raw date integer, so it cannot correlate with the other modes', () => {
    // The other date-seeded modes key off `YYYYMMDD` directly; GlobeSet salts it.
    expect(seedFromDateKey('2026-09-20')).not.toBe(20260920);
  });

  it('survives a malformed date key without throwing', () => {
    expect(() => dealForDate('not-a-date')).not.toThrow();
    expect(dealForDate('not-a-date')).toHaveLength(DECK_SIZE);
  });

  it('still XORs to zero after shuffling — the clear-always invariant', () => {
    for (let seed = 0; seed < 50; seed++) expect(xorAll(dealFromSeed(seed))).toBe(0);
  });
});

describe('run transitions', () => {
  const deck = dealForDate('2026-09-20');

  it('deals a full board and keeps the deck accounted for', () => {
    const run = createRun(deck);
    expect(run.board).toHaveLength(BOARD_SIZE);
    expect(run.drawIndex).toBe(BOARD_SIZE);
    expect(cardsRemaining(run)).toBe(DECK_SIZE);
    expect(runProgress(run)).toBe(0);
    expect(run.status).toBe('playing');
  });

  it('accepts a real GlobeSet, refills the board and records it', () => {
    const run = createRun(deck);
    const indices = findSmallestGlobeSet(run.board)!;
    const { state, outcome, taken } = submitSelection(run, indices, 1234);

    expect(outcome).toBe('accepted');
    expect(isGlobeSet(taken)).toBe(true);
    expect(state.board).toHaveLength(BOARD_SIZE);
    expect(state.found).toHaveLength(1);
    expect(state.found[0].atMs).toBe(1234);
    expect(state.found[0].bySolver).toBe(false);
    expect(state.misses).toBe(0);
    expect(cardsRemaining(state)).toBe(DECK_SIZE - taken.length);
    // The previous state is untouched — the board animates out of it.
    expect(run.found).toHaveLength(0);
    expect(run.board).toHaveLength(BOARD_SIZE);
  });

  it('counts a wrong guess as a miss and changes nothing else', () => {
    const run = createRun(deck);
    const good = new Set(findSmallestGlobeSet(run.board)!);
    const bad = [0, 1, 2].filter((i) => !good.has(i) || good.size > 3);
    const { state, outcome } = submitSelection(run, bad.length >= 2 ? bad : [0, 1], 10);
    if (outcome === 'accepted') return; // the sampled indices happened to be a GlobeSet
    expect(outcome).toBe('not-a-globeset');
    expect(state.misses).toBe(1);
    expect(state.board).toEqual(run.board);
    expect(state.found).toHaveLength(0);
  });

  it('rejects an empty selection without charging a miss', () => {
    const run = createRun(deck);
    const { state, outcome } = submitSelection(run, [], 0);
    expect(outcome).toBe('empty');
    expect(state.misses).toBe(0);
  });

  it('rejects a duplicated or out-of-range index', () => {
    const run = createRun(deck);
    expect(submitSelection(run, [0, 0, 1], 0).outcome).toBe('not-a-globeset');
    expect(submitSelection(run, [0, 99], 0).outcome).toBe('not-a-globeset');
    expect(submitSelection(run, [-1], 0).outcome).toBe('not-a-globeset');
  });

  it('plays a whole deal out to an empty board', () => {
    let run = createRun(deck);
    let guard = 0;
    while (run.status === 'playing' && guard++ < 100) {
      const indices = findSmallestGlobeSet(run.board);
      expect(indices).not.toBeNull();
      const result = submitSelection(run, indices!, guard * 1000);
      expect(result.outcome).toBe('accepted');
      run = result.state;
    }
    expect(run.status).toBe('complete');
    expect(run.board).toHaveLength(0);
    expect(cardsRemaining(run)).toBe(0);
    expect(runProgress(run)).toBe(1);
    expect(run.found.flatMap((f) => f.cards)).toHaveLength(DECK_SIZE);
    // Never fewer than three cards in a GlobeSet, so never more than 21 of them.
    expect(run.found.length).toBeLessThanOrEqual(DECK_SIZE / 3);
  });

  it('refuses further submissions once the deck is clear', () => {
    let run = createRun(deck);
    let guard = 0;
    while (run.status === 'playing' && guard++ < 100) {
      run = submitSelection(run, findSmallestGlobeSet(run.board)!, 0).state;
    }
    expect(submitSelection(run, [0], 0).outcome).toBe('finished');
  });

  it('charges a hint', () => {
    expect(takeHint(createRun(deck)).hints).toBe(1);
  });

  it('marks a solver step as the solver’s, and flags the run', () => {
    const run = createRun(deck);
    const next = applySolverStep(run, findSmallestGlobeSet(run.board)!, 500);
    expect(next.solverUsed).toBe(true);
    expect(next.found[0].bySolver).toBe(true);
  });

  it('ignores a solver step that is not a GlobeSet', () => {
    const run = createRun(deck);
    expect(applySolverStep(run, [0], 0)).toBe(run);
  });
});

describe('scoring', () => {
  const base = {
    dateKey: '2026-09-20',
    puzzleNumber: 100,
    sizes: [3, 3, 4, 3],
    misses: 0,
    hints: 0,
    solverUsed: false,
  };

  it('stays inside the range the score API accepts', () => {
    for (const timeSeconds of [0, 1, 60, PAR_SECONDS, 600, 3600, 10_000]) {
      for (const misses of [0, 5, 50, 500]) {
        for (const hints of [0, 3, 40]) {
          const points = scoreRun({ ...base, timeSeconds, misses, hints });
          expect(points).toBeGreaterThanOrEqual(0);
          expect(points).toBeLessThanOrEqual(999);
        }
      }
    }
  });

  it('rewards a faster run', () => {
    const fast = scoreRun({ ...base, timeSeconds: 60 });
    const slow = scoreRun({ ...base, timeSeconds: 600 });
    expect(fast).toBeGreaterThan(slow);
  });

  it('penalises misses and hints', () => {
    const clean = scoreRun({ ...base, timeSeconds: 200 });
    expect(scoreRun({ ...base, timeSeconds: 200, misses: 4 })).toBeLessThan(clean);
    expect(scoreRun({ ...base, timeSeconds: 200, hints: 2 })).toBeLessThan(clean);
  });

  it('scores a solved-out run at zero', () => {
    expect(scoreRun({ ...base, timeSeconds: 10, solverUsed: true })).toBe(0);
  });

  it('never drops a finished run to zero, however badly it went', () => {
    expect(scoreRun({ ...base, timeSeconds: 9999, misses: 999, hints: 99 })).toBeGreaterThan(0);
  });

  it('summarises a run into what the share card needs', () => {
    const deck = dealForDate('2026-09-20');
    let run = createRun(deck);
    run = submitSelection(run, findSmallestGlobeSet(run.board)!, 0).state;
    const summary = summarise(run, '2026-09-20', 7, 42.6);
    expect(summary.timeSeconds).toBe(43);
    expect(summary.sizes).toEqual(run.found.map((f) => f.cards.length));
    expect(summary.puzzleNumber).toBe(7);
  });
});

describe('formatDuration', () => {
  it('reads as a clock', () => {
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(9)).toBe('0:09');
    expect(formatDuration(75)).toBe('1:15');
    expect(formatDuration(600)).toBe('10:00');
    expect(formatDuration(3661)).toBe('1:01:01');
    expect(formatDuration(-5)).toBe('0:00');
  });
});

describe('the share card', () => {
  const summary = {
    dateKey: '2026-09-20',
    puzzleNumber: 173,
    timeSeconds: 222,
    sizes: [3, 3, 4, 3, 5, 3, 3, 6, 3, 8],
    misses: 2,
    hints: 1,
    solverUsed: false,
  };

  it('prints one square per GlobeSet, seven to a row', () => {
    const grid = shareGrid(summary.sizes);
    const rows = grid.split('\n');
    expect(rows).toHaveLength(2);
    expect([...rows[0]].length).toBe(7);
    expect([...rows[1]].length).toBe(3);
  });

  it('colours the squares by size, and lumps everything past six together', () => {
    expect(shareGrid([3])).toBe('🟩');
    expect(shareGrid([4])).toBe('🟦');
    expect(shareGrid([5])).toBe('🟪');
    expect(shareGrid([6])).toBe('🟧');
    expect(shareGrid([7])).toBe('🟥');
    expect(shareGrid([12])).toBe('🟥');
  });

  it('marks the solver’s squares apart from the player’s', () => {
    expect(shareGrid([3, 3, 3], 1)).toBe('🟩⬛⬛');
  });

  it('leads with the time and never names a card', () => {
    const text = generateGlobeSetShare(summary, { rank: 4, streak: 9 });
    expect(text).toContain('🔮 RMH GlobeSet #173');
    expect(text).toContain('3:42');
    expect(text).toContain('🏅 #4');
    expect(text).toContain('🔥 9');
    expect(text).toContain('💡 1');
    expect(text).toContain('https://rmhstudios.com/daily/globeset');
    expect(text).not.toMatch(/\bcard\b/i);
    expect(text).not.toMatch(/\n{3,}/);
  });

  it('says so when the solver finished the run, and drops the accuracy claim', () => {
    const text = generateGlobeSetShare({ ...summary, solverUsed: true }, { solverFrom: 0 });
    expect(text).toContain('🏳️');
    expect(text).not.toContain('🎯');
  });

  it('hides a streak of one and an absent rank', () => {
    const text = generateGlobeSetShare(summary, { rank: null, streak: 1 });
    expect(text).not.toContain('🏅');
    expect(text).not.toContain('🔥');
  });

  it('computes accuracy from attempts, and survives an empty run', () => {
    expect(accuracy(summary)).toBe(83); // 10 of 12
    expect(accuracy({ ...summary, misses: 0 })).toBe(100);
    expect(accuracy({ ...summary, sizes: [], misses: 0 })).toBe(0);
  });

  it('writes a race card with the right medal', () => {
    expect(generateRaceShare(1, 4, summary)).toContain('🥇 1/4');
    expect(generateRaceShare(4, 4, summary)).toContain('🏁 4/4');
  });
});

describe('local persistence', () => {
  const store = new Map<string, string>();

  beforeEach(() => {
    store.clear();
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, v),
        removeItem: (k: string) => void store.delete(k),
      },
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  const dateKey = '2026-09-20';
  const deck = dealForDate(dateKey);

  function snapshotOf(run: ReturnType<typeof createRun>, elapsedMs = 1000) {
    return {
      dateKey,
      board: run.board,
      drawIndex: run.drawIndex,
      found: run.found.map((f) => ({ cards: f.cards, atMs: f.atMs, bySolver: f.bySolver })),
      misses: run.misses,
      hints: run.hints,
      solverUsed: run.solverUsed,
      elapsedMs,
    };
  }

  it('round-trips a run in progress', () => {
    let run = createRun(deck);
    run = submitSelection(run, findSmallestGlobeSet(run.board)!, 900).state;
    saveRun(snapshotOf(run, 4321));

    const restored = loadRun(dateKey);
    expect(restored).not.toBeNull();
    expect(restored!.board).toEqual(run.board);
    expect(restored!.drawIndex).toBe(run.drawIndex);
    expect(restored!.elapsedMs).toBe(4321);
  });

  it('will not restore yesterday’s run into today', () => {
    saveRun(snapshotOf(createRun(deck)));
    expect(loadRun('2026-09-21')).toBeNull();
  });

  it('drops a snapshot that the day’s deal cannot produce', () => {
    const run = createRun(deck);
    const tampered = snapshotOf(run);
    // Claim a card that was never dealt.
    tampered.board = [...run.board.slice(1), deck[DECK_SIZE - 1]];
    saveRun(tampered);
    expect(loadRun(dateKey)).toBeNull();
  });

  it('drops a snapshot claiming progress it never made', () => {
    const run = createRun(deck);
    const tampered = { ...snapshotOf(run), drawIndex: DECK_SIZE };
    saveRun(tampered);
    expect(loadRun(dateKey)).toBeNull();
  });

  it('rejects a duplicated card across the board and the found pile', () => {
    const run = createRun(deck);
    const snapshot = snapshotOf(run);
    snapshot.found = [{ cards: [run.board[0]], atMs: 0, bySolver: false }];
    expect(snapshotMatchesDeck({ ...snapshot, v: 1, updatedAt: 0 }, deck)).toBe(false);
  });

  it('clears on request', () => {
    saveRun(snapshotOf(createRun(deck)));
    clearRun();
    expect(loadRun(dateKey)).toBeNull();
  });

  it('survives storage that throws', () => {
    vi.stubGlobal('window', {
      localStorage: {
        getItem: () => {
          throw new Error('denied');
        },
        setItem: () => {
          throw new Error('denied');
        },
        removeItem: () => {
          throw new Error('denied');
        },
      },
    });
    expect(() => saveRun(snapshotOf(createRun(deck)))).not.toThrow();
    expect(loadRun(dateKey)).toBeNull();
    expect(loadStats().runs).toBe(0);
  });

  it('keeps a best time, and never sets one from a solved-out run', () => {
    recordCompletion({ dateKey: '2026-09-18', timeSeconds: 300, globeSets: 18, solverUsed: false });
    expect(loadStats().bestSeconds).toBe(300);
    recordCompletion({ dateKey: '2026-09-19', timeSeconds: 240, globeSets: 17, solverUsed: false });
    expect(loadStats().bestSeconds).toBe(240);
    recordCompletion({ dateKey: '2026-09-20', timeSeconds: 10, globeSets: 9, solverUsed: true });
    const stats = loadStats();
    expect(stats.bestSeconds).toBe(240);
    expect(stats.runs).toBe(3); // a solved-out run still counts as played
    expect(stats.totalGlobeSets).toBe(18 + 17 + 9);
  });

  it('does not double-count a day replayed', () => {
    recordCompletion({ dateKey, timeSeconds: 300, globeSets: 18, solverUsed: false });
    recordCompletion({ dateKey, timeSeconds: 200, globeSets: 18, solverUsed: false });
    const stats = loadStats();
    expect(stats.runs).toBe(1);
    expect(stats.totalGlobeSets).toBe(18);
    expect(stats.bestSeconds).toBe(200); // the better time still lands
  });
});

describe('streakFrom', () => {
  it('counts back from today', () => {
    expect(streakFrom(['2026-09-18', '2026-09-19', '2026-09-20'], '2026-09-20')).toBe(3);
  });

  it('still counts when today has not been played yet', () => {
    expect(streakFrom(['2026-09-18', '2026-09-19'], '2026-09-20')).toBe(2);
  });

  it('breaks on a gap', () => {
    expect(streakFrom(['2026-09-10', '2026-09-19', '2026-09-20'], '2026-09-20')).toBe(2);
    expect(streakFrom(['2026-09-01'], '2026-09-20')).toBe(0);
    expect(streakFrom([], '2026-09-20')).toBe(0);
  });

  it('crosses a month boundary', () => {
    expect(streakFrom(['2026-08-30', '2026-08-31', '2026-09-01'], '2026-09-01')).toBe(3);
  });

  it('returns zero for a nonsense date rather than looping', () => {
    expect(streakFrom(['2026-09-20'], 'nope')).toBe(0);
  });
});

/**
 * The race protocol's own traps.
 *
 * Both of these were shipped bugs found by driving two browsers at the hub, and
 * neither is visible by reading the code: `.partial()` looks like it turns a
 * schema into "only the fields I sent", and a card mask looks interchangeable
 * with a board position until a refill lands between the click and the server.
 */
describe('the race settings patch', () => {
  it('leaves out what the host did not change', () => {
    const patch = EVENTS['globeset:settings'].c2s!.parse({ sprintTarget: 5 });
    expect(patch).toEqual({ sprintTarget: 5 });
    // The trap: `SettingsZ.partial()` answers the line below instead, so every
    // settings change silently reset the two the host did not touch.
    expect(patch).not.toHaveProperty('goal');
    expect(patch).not.toHaveProperty('isPublic');
  });

  it('still rejects a value that is not on the menu', () => {
    expect(EVENTS['globeset:settings'].c2s!.safeParse({ sprintTarget: 7 }).success).toBe(false);
    expect(EVENTS['globeset:settings'].c2s!.safeParse({ goal: 'whatever' }).success).toBe(false);
  });

  it('fills the defaults in on CREATE, where absent really does mean default', () => {
    expect(EVENTS['globeset:create'].c2s!.parse({})).toEqual({
      isPublic: true,
      goal: 'clear',
      sprintTarget: 10,
    });
  });
});

describe('the race submission contract', () => {
  it('takes card masks, bounded by the board', () => {
    const submit = EVENTS['globeset:submit'].c2s!;
    expect(submit.safeParse({ cards: [1, 2, 3] }).success).toBe(true);
    expect(submit.safeParse({ cards: [] }).success).toBe(false);
    expect(submit.safeParse({ cards: [0] }).success).toBe(false); // 0 is not a card
    expect(submit.safeParse({ cards: [64] }).success).toBe(false); // nor is 64
    expect(submit.safeParse({ cards: new Array(8).fill(1) }).success).toBe(false); // wider than a board
  });
});
