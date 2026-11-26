import { describe, expect, it } from 'vitest';
import {
  HK_ALPHABET,
  completedWord,
  countdownTicks,
  dealLetters,
  judgePress,
  letterCounts,
  nextLetterIndex,
  redistributeLetters,
  scoreRound,
  teamMultiplier,
  withinRateLimit,
} from '../rules';
import { HumanKeyboardSettingsSchema, PressInputSchema } from '../schemas';
import { HUMAN_KEYBOARD_SETTINGS } from '../settings';

/** A deterministic rng so a deal is repeatable. */
function seeded(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

describe('dealLetters', () => {
  it.each([3, 4, 5, 7, 10])('deals the 26 letters once each among %i players', (n) => {
    const ids = Array.from({ length: n }, (_, i) => `p${i}`);
    const deal = dealLetters(ids, seeded(n));
    const all = [...deal.values()].flat().sort();
    expect(all.join('')).toBe(HK_ALPHABET);
    expect([...deal.keys()]).toEqual(ids);
    // Round-robin: no one holds more than one letter above anyone else
    const sizes = [...deal.values()].map((l) => l.length);
    expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);
    // Sorted for the pad
    for (const letters of deal.values()) expect([...letters].sort()).toEqual(letters);
  });

  it('deals different hands on different shuffles', () => {
    const ids = ['a', 'b', 'c'];
    const one = JSON.stringify([...dealLetters(ids, seeded(1))]);
    const two = JSON.stringify([...dealLetters(ids, seeded(2))]);
    expect(one).not.toBe(two);
  });

  it('deals nothing when nobody is there', () => {
    expect(dealLetters([]).size).toBe(0);
  });

  it('shows the table only how many letters each holds', () => {
    const deal = dealLetters(['a', 'b', 'c'], seeded(3));
    expect(letterCounts(deal)).toEqual({ a: 9, b: 9, c: 8 });
  });
});

describe('redistributeLetters', () => {
  it('moves only the leaving player letters, to the others', () => {
    const deal = dealLetters(['a', 'b', 'c'], seeded(4));
    const before = new Map([...deal].map(([k, v]) => [k, [...v]]));
    const next = redistributeLetters(deal, ['c'], ['a', 'b'], seeded(5));
    expect(next.get('c')).toEqual([]);
    // Everyone keeps what they had and the 26 letters are still dealt once each
    for (const id of ['a', 'b']) for (const l of before.get(id)!) expect(next.get(id)).toContain(l);
    expect([...next.values()].flat().sort().join('')).toBe(HK_ALPHABET);
  });
});

describe('the cursor over a sentence with spaces', () => {
  const text = 'ab cd';
  it('skips spaces', () => {
    expect(nextLetterIndex(text, 0)).toBe(0);
    expect(nextLetterIndex(text, 2)).toBe(3);
    expect(nextLetterIndex(text, 5)).toBe(5);
    expect(nextLetterIndex(text, 99)).toBe(99);
  });

  it('judges a press', () => {
    expect(judgePress(text, 0, 'a', ['a'])).toBe('correct');
    expect(judgePress(text, 0, 'a', ['b'])).toBe('not_yours');
    expect(judgePress(text, 0, 'b', ['b'])).toBe('wrong');
    expect(judgePress(text, 2, 'c', ['c'])).toBe('spacing');
    expect(judgePress(text, 5, 'c', ['c'])).toBe('done');
  });

  it('finds the word a press has just finished', () => {
    expect(completedWord(text, 1)).toBeNull();
    expect(completedWord(text, 2)).toBe('ab');
    expect(completedWord(text, 3)).toBeNull();
    expect(completedWord(text, 5)).toBe('cd');
    expect(completedWord(text, 0)).toBeNull();
  });
});

describe('the rate limit', () => {
  it('allows five presses in a second and drops the sixth', () => {
    const times = [0, 100, 200, 300, 400];
    expect(withinRateLimit(times, 500, 5, 1000)).toBe(false);
    expect(withinRateLimit(times, 1001, 5, 1000)).toBe(true);
    expect(withinRateLimit(times.slice(0, 4), 500, 5, 1000)).toBe(true);
  });
});

describe('scoring', () => {
  it('gives the team multiplier by how fast the table finished', () => {
    expect(teamMultiplier(true, 45_000, 90_000)).toBe(1.5);
    expect(teamMultiplier(true, 45_001, 90_000)).toBe(1);
    expect(teamMultiplier(true, 80_000, 90_000)).toBe(1);
    expect(teamMultiplier(false, 90_000, 90_000)).toBe(0.5);
  });

  it('scores a finished round with the multiplier applied once to the sum', () => {
    // ann 10 correct, 0 wrong; ben 6 correct, 2 wrong; cat 4 correct, 0 wrong. 30 s used, 60 s left.
    const { multiplier, players } = scoreRound({
      players: [
        { userId: 'ann', correct: 10, wrong: 0 },
        { userId: 'ben', correct: 6, wrong: 2 },
        { userId: 'cat', correct: 4, wrong: 0 },
      ],
      completed: true,
      secondsLeft: 60,
      elapsedMs: 30_000,
      limitMs: 90_000,
    });
    expect(multiplier).toBe(1.5);
    const by = Object.fromEntries(players.map((p) => [p.userId, p]));
    // ann: 200 + 200 perfect + 100 done + 300 time + 100 mvp = 900, x1.5 = 1350
    expect(by.ann).toMatchObject({ raw: 900, points: 1350, perfect: true, mvp: true });
    // ben: 120 - 10 + 100 + 300 = 510, x1.5 = 765, not perfect
    expect(by.ben).toMatchObject({ raw: 510, points: 765, perfect: false, mvp: false });
    // cat: 80 + 200 + 100 + 300 = 680, x1.5 = 1020
    expect(by.cat).toMatchObject({ raw: 680, points: 1020, perfect: true });
  });

  it('scores an unfinished round at half, with no completion or time bonus, and ties share the MVP bonus', () => {
    const { multiplier, players } = scoreRound({
      players: [
        { userId: 'ann', correct: 5, wrong: 1 },
        { userId: 'ben', correct: 5, wrong: 0 },
        { userId: 'cat', correct: 0, wrong: 0 },
      ],
      completed: false,
      secondsLeft: 0,
      elapsedMs: 90_000,
      limitMs: 90_000,
    });
    expect(multiplier).toBe(0.5);
    const by = Object.fromEntries(players.map((p) => [p.userId, p]));
    // ann: 100 - 5 + 100 mvp = 195, x0.5 = 98 (rounded)
    expect(by.ann).toMatchObject({ raw: 195, points: 98, mvp: true, perfect: false });
    // ben: 100 + 200 perfect + 100 mvp = 400, x0.5 = 200
    expect(by.ben).toMatchObject({ raw: 400, points: 200, mvp: true, perfect: true });
    // cat pressed nothing: no perfect-accuracy bonus, no MVP
    expect(by.cat).toMatchObject({ raw: 0, points: 0, mvp: false, perfect: false });
  });

  it('never scores a round below zero', () => {
    const { players } = scoreRound({
      players: [{ userId: 'ann', correct: 0, wrong: 3 }],
      completed: false,
      secondsLeft: 0,
      elapsedMs: 90_000,
      limitMs: 90_000,
    });
    expect(players[0]!.points).toBe(0);
  });
});

describe('input and settings schemas', () => {
  it('accepts one lowercase letter only', () => {
    expect(PressInputSchema.safeParse({ key: 'a' }).success).toBe(true);
    for (const key of ['A', 'ab', '', '1', ' ', 'é'])
      expect(PressInputSchema.safeParse({ key }).success, key).toBe(false);
    expect(PressInputSchema.safeParse({}).success).toBe(false);
  });

  it('keeps the settings to the specified ranges', () => {
    expect(HumanKeyboardSettingsSchema.safeParse({ rounds: 2, reshuffleSeconds: 8 }).success).toBe(true);
    expect(HumanKeyboardSettingsSchema.safeParse({ rounds: 4, reshuffleSeconds: 8 }).success).toBe(false);
    expect(HumanKeyboardSettingsSchema.safeParse({ rounds: 2, reshuffleSeconds: 5 }).success).toBe(false);
    const byKey = Object.fromEntries(HUMAN_KEYBOARD_SETTINGS.map((s) => [s.key, s]));
    expect(byKey.rounds).toMatchObject({ min: 1, max: 3, default: 2 });
    expect(byKey.reshuffleSeconds).toMatchObject({ min: 6, max: 15, default: 8 });
  });
});

describe('the client clock', () => {
  it('ticks only while typing is live', () => {
    expect(countdownTicks('TYPING', false)).toBe(true);
    expect(countdownTicks('TYPING', true)).toBe(false);
    expect(countdownTicks('REVEAL', false)).toBe(false);
    expect(countdownTicks('ROUND_RESULT', false)).toBe(false);
    expect(countdownTicks('WAITING', false)).toBe(false);
  });
});
