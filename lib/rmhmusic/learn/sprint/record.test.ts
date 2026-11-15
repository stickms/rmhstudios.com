import { describe, expect, it } from 'vitest';
import {
  DATE_GRACE_MS,
  acceptDealtDate,
  checkDailyRun,
  checkFreeplayRun,
  dailyStreak,
  nextBest,
  sameRun,
} from './record';
import { DAILY_LEVELS, DAILY_PROMPTS_PER_LEVEL, FREEPLAY_PROMPTS, sprintLevel } from './levels';
import type { SprintLevelId } from './levels';
import type { PromptResult } from './scoring';

const MIDNIGHT = Date.UTC(2026, 10, 15);

function right(level: SprintLevelId, ms: number, points = 999): PromptResult {
  const kind = sprintLevel(level)?.kind ?? 'note';
  return {
    level,
    kind,
    correct: true,
    ms,
    noteMs: kind === 'bar' ? [ms / 4, ms / 4, ms / 4, ms / 4] : [ms],
    points,
    skipped: false,
  };
}

function skippedChord(level: SprintLevelId): PromptResult {
  return {
    level,
    kind: 'chord',
    correct: false,
    ms: null,
    noteMs: [],
    points: 0,
    skipped: true,
  };
}

const freeplay = (level: SprintLevelId, ms = 1000) =>
  Array.from({ length: FREEPLAY_PROMPTS }, () => right(level, ms));

const daily = (ms = 1000) =>
  DAILY_LEVELS.flatMap((level) =>
    Array.from({ length: DAILY_PROMPTS_PER_LEVEL }, () => right(level, ms)),
  );

describe('acceptDealtDate — the server decides the day', () => {
  it("accepts today's UTC date", () => {
    expect(acceptDealtDate('2026-11-15', MIDNIGHT + 5 * 3600_000)).toBe(true);
  });
  it('accepts yesterday only within the grace window after midnight', () => {
    expect(acceptDealtDate('2026-11-14', MIDNIGHT + DATE_GRACE_MS - 1)).toBe(true);
    expect(acceptDealtDate('2026-11-14', MIDNIGHT + DATE_GRACE_MS + 1)).toBe(false);
  });
  it('never accepts tomorrow, an older day or a malformed date', () => {
    expect(acceptDealtDate('2026-11-16', MIDNIGHT + 1000)).toBe(false);
    expect(acceptDealtDate('2026-11-13', MIDNIGHT + 1000)).toBe(false);
    expect(acceptDealtDate('2026-02-30', MIDNIGHT)).toBe(false);
    expect(acceptDealtDate('15/11/2026', MIDNIGHT)).toBe(false);
  });
});

describe('checkFreeplayRun — recompute, never trust the client', () => {
  it("recomputes every prompt's points and the summary from the times", () => {
    const run = checkFreeplayRun('note', freeplay('note', 1200));
    expect(run).not.toBeNull();
    expect(run?.results.every((r) => r.points === 100)).toBe(true);
    expect(run?.summary).toMatchObject({ score: 100, correct: 20, played: 20, avgMs: 1200 });
  });
  it('a slow prompt scores what the par says, whatever points the client sent', () => {
    // note par 1200 ms, zero at 4800 ms: 3000 ms is half way.
    const run = checkFreeplayRun('note', freeplay('note', 3000));
    expect(run?.summary.score).toBe(50);
  });
  it('a wrong answer scores 0', () => {
    const results = freeplay('note');
    results[0] = { ...right('note', 500), correct: false };
    const run = checkFreeplayRun('note', results);
    expect(run?.results[0]?.points).toBe(0);
    expect(run?.summary.correct).toBe(19);
  });
  it('rejects the wrong length, a mixed level or a kind that does not match the level', () => {
    expect(checkFreeplayRun('note', freeplay('note').slice(1))).toBeNull();
    const mixed = freeplay('note');
    mixed[3] = right('accidental', 900);
    expect(checkFreeplayRun('note', mixed)).toBeNull();
    const lying = freeplay('note');
    lying[2] = { ...right('note', 900), kind: 'chord' };
    expect(checkFreeplayRun('note', lying)).toBeNull();
  });
  it('rejects a skipped prompt that is not a chord, or a skip carrying a time', () => {
    const bad = freeplay('note');
    bad[0] = { ...skippedChord('note'), kind: 'note' };
    expect(checkFreeplayRun('note', bad)).toBeNull();
    const timed = freeplay('triad');
    timed[0] = { ...skippedChord('triad'), ms: 500 };
    expect(checkFreeplayRun('triad', timed)).toBeNull();
  });
  it('rejects a played prompt without a time, and a run with nothing played', () => {
    const untimed = freeplay('note');
    untimed[0] = { ...right('note', 1), ms: null };
    expect(checkFreeplayRun('note', untimed)).toBeNull();
    const none = Array.from({ length: FREEPLAY_PROMPTS }, () => skippedChord('triad'));
    expect(checkFreeplayRun('triad', none)).toBeNull();
  });
  it('a bar uses its four-note par (2000 + 3 × 700 ms)', () => {
    const run = checkFreeplayRun('bar', freeplay('bar', 4100));
    expect(run?.summary.score).toBe(100);
  });
});

describe('checkDailyRun', () => {
  it('takes the six daily levels in order, five prompts each', () => {
    expect(checkDailyRun(daily())?.summary.played).toBe(30);
  });
  it('lets the microphone skip the chord levels and scores the rest', () => {
    const results = daily().map((r) => (r.kind === 'chord' ? skippedChord(r.level) : r));
    const run = checkDailyRun(results);
    expect(run?.summary).toMatchObject({ played: 20, skipped: 10, score: 100 });
  });
  it('rejects a run out of order or of the wrong length', () => {
    const swapped = daily();
    const [a, b] = [swapped[0], swapped[29]];
    if (!a || !b) throw new Error('fixture');
    swapped[0] = b;
    swapped[29] = a;
    expect(checkDailyRun(swapped)).toBeNull();
    expect(checkDailyRun(daily().slice(0, 29))).toBeNull();
  });
});

describe('sameRun — a retried POST is the same run', () => {
  it('matches the same results whatever points the client claimed, and not another run', () => {
    const a = checkDailyRun(daily(1000));
    const retry = checkDailyRun(daily(1000).map((r) => ({ ...r, points: 1 })));
    const other = checkDailyRun(daily(1100));
    if (!a || !retry || !other) throw new Error('fixture');
    expect(sameRun(a.results, retry.results)).toBe(true);
    expect(sameRun(a.results, other.results)).toBe(false);
    expect(sameRun(null, a.results)).toBe(false);
  });
});

describe('nextBest', () => {
  it('keeps the higher score and the faster average, independently', () => {
    expect(nextBest(null, { score: 70, avgMs: 1500 })).toEqual({ bestScore: 70, bestAvgMs: 1500 });
    expect(nextBest({ bestScore: 80, bestAvgMs: 1500 }, { score: 70, avgMs: 1200 })).toEqual({
      bestScore: 80,
      bestAvgMs: 1200,
    });
    expect(nextBest({ bestScore: 80, bestAvgMs: 1200 }, { score: 90, avgMs: null })).toEqual({
      bestScore: 90,
      bestAvgMs: 1200,
    });
    expect(nextBest({ bestScore: 0, bestAvgMs: null }, { score: 0, avgMs: null })).toEqual({
      bestScore: 0,
      bestAvgMs: null,
    });
  });
});

describe('dailyStreak — consecutive scored days ending today or yesterday', () => {
  it('counts back from today', () => {
    expect(dailyStreak(['2026-11-15', '2026-11-14', '2026-11-13', '2026-11-11'], '2026-11-15')).toBe(3);
  });
  it('still counts a streak whose last day was yesterday (today is not played yet)', () => {
    expect(dailyStreak(['2026-11-14', '2026-11-13'], '2026-11-15')).toBe(2);
  });
  it('is 0 after a missed day, and ignores order and duplicates', () => {
    expect(dailyStreak(['2026-11-13'], '2026-11-15')).toBe(0);
    expect(dailyStreak(['2026-11-14', '2026-11-15', '2026-11-15'], '2026-11-15')).toBe(2);
    expect(dailyStreak([], '2026-11-15')).toBe(0);
  });
});
