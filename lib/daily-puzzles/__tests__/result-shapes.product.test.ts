import { describe, expect, it } from 'vitest';
import {
  hasAlibiResult,
  hasChainlinkResult,
  hasImpostorResult,
  hasOutcastResult,
  hasSpectrumResult,
  readAlibiResult,
  readChainlinkResult,
  readGlobeSetResult,
  readImpostorResult,
  readLightsOutResult,
  readOutcastResult,
  readSpectrumResult,
} from '@/lib/daily-puzzles/result-shapes';

const JUNK: unknown[] = [undefined, 'text', 7, true, [], [1, 2], { guesses: 'no' }, { chain: 4, itemScores: 'x' }];

describe('Alibi', () => {
  it('has nothing to replay for null, {} and junk', () => {
    for (const raw of [null, {}, ...JUNK]) expect(hasAlibiResult(raw)).toBe(false);
    expect(readAlibiResult(null)).toEqual({ guesses: [], solved: false, failed: false });
    expect(readAlibiResult({})).toEqual({ guesses: [], solved: false, failed: false });
    for (const raw of JUNK) expect(readAlibiResult(raw)).toEqual({ guesses: [], solved: false, failed: false });
  });
  it('reads a full result and drops non-string guesses', () => {
    const raw = { guesses: ['Ana', 3, 'Bo'], solved: true, failed: false };
    expect(hasAlibiResult(raw)).toBe(true);
    expect(readAlibiResult(raw)).toEqual({ guesses: ['Ana', 'Bo'], solved: true, failed: false });
  });
});

describe('Chainlink', () => {
  it('has nothing to replay for null, {} and junk, and the chain defaults to one empty link', () => {
    for (const raw of [null, {}, ...JUNK]) {
      expect(hasChainlinkResult(raw)).toBe(false);
      expect(readChainlinkResult(raw)).toEqual({ chain: [''], completed: false, gaveUp: false });
    }
  });
  it('reads a full result', () => {
    const raw = { chain: ['a', 'b'], completed: true, gaveUp: true };
    expect(hasChainlinkResult(raw)).toBe(true);
    expect(readChainlinkResult(raw)).toEqual(raw);
  });
});

describe('Outcast', () => {
  it('has nothing to replay for null, {} and junk', () => {
    for (const raw of [null, {}, ...JUNK]) {
      expect(hasOutcastResult(raw)).toBe(false);
      expect(readOutcastResult(raw)).toEqual({ correctRounds: [], selectedNames: [] });
    }
  });
  it('reads a full result, selectedNames optional', () => {
    expect(hasOutcastResult({ correctRounds: [true, false] })).toBe(true);
    expect(readOutcastResult({ correctRounds: [true, 'x', false], selectedNames: ['a', 1] })).toEqual({
      correctRounds: [true, false, false],
      selectedNames: ['a'],
    });
  });
});

describe('Spectrum', () => {
  it('has nothing to replay for null, {} and junk', () => {
    for (const raw of [null, {}, { itemScores: [] }, { itemScores: [null, 4] }, ...JUNK]) {
      expect(hasSpectrumResult(raw)).toBe(false);
      expect(readSpectrumResult(raw)).toEqual({ accuracy: 0, points: 0, itemScores: [] });
    }
  });
  it('reads a full result and derives accuracy when missing', () => {
    const itemScores = [
      { name: 'A', playerRank: 1, trueRank: 1, score: 2 },
      { name: 'B', playerRank: 3, trueRank: 2, score: 1 },
    ];
    const full = { accuracy: 3, points: 10, itemScores };
    expect(hasSpectrumResult(full)).toBe(true);
    expect(readSpectrumResult(full)).toEqual(full);
    expect(readSpectrumResult({ itemScores })).toEqual({ accuracy: 3, points: 0, itemScores });
  });
});

describe('Impostor', () => {
  it('has nothing to replay for null, {} and junk', () => {
    for (const raw of [null, {}, ...JUNK]) {
      expect(hasImpostorResult(raw)).toBe(false);
      expect(readImpostorResult(raw)).toEqual({ foundFakes: [], guessNumber: 2, confirmedReal: [] });
    }
  });
  it('reads a full result', () => {
    const raw = { foundFakes: ['x'], guessNumber: 1, confirmedReal: [0, 'n', 2] };
    expect(hasImpostorResult(raw)).toBe(true);
    expect(readImpostorResult(raw)).toEqual({ foundFakes: ['x'], guessNumber: 1, confirmedReal: [0, 2] });
  });
});

describe('Lights Out and GlobeSet readers (hub and stats rows)', () => {
  it('never throw on null, {} or junk', () => {
    for (const raw of [null, {}, ...JUNK]) {
      expect(readLightsOutResult(raw)).toEqual({ dnf: false, hintUsed: false });
      expect(readGlobeSetResult(raw)).toEqual({ misses: 0, hints: 0, solverUsed: false });
    }
  });
  it('read a full result', () => {
    expect(readLightsOutResult({ moves: 9, dnf: true, hintUsed: true, optimalMoves: 7 })).toEqual({
      moves: 9,
      dnf: true,
      hintUsed: true,
      optimalMoves: 7,
    });
    expect(readGlobeSetResult({ sizes: [3, 'x', 4], misses: 2, hints: 1, solverUsed: true, solverFrom: 5 })).toEqual({
      sizes: [3, 4],
      misses: 2,
      hints: 1,
      solverUsed: true,
      solverFrom: 5,
    });
  });
});
