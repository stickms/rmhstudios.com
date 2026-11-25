import { describe, expect, it } from 'vitest';
import {
  EARLY_WRONG_POINTS,
  FINAL_CORRECT_POINTS,
  cleanGuess,
  cleanQuestion,
  cleanText,
  difficultiesFor,
  drawIdentities,
  earlyCorrectPoints,
  efficiencyPoints,
  judgeGuess,
  normalizeForMatch,
  plurality,
  seatAt,
  tally,
  turnOrder,
} from '../rules';
import type { GuessMatcher, Identity } from '../rules';
import { IDENTITY_CRISIS_SETTINGS } from '../settings';
import { validateGameSettings } from '../../game-settings';
import { AskInputSchema, GuessInputSchema, VoteInputSchema } from '../schemas';

/** A repeatable random source (mulberry32). */
function seeded(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function identity(id: string, category: string, difficulty: Identity['difficulty']): Identity {
  return { id, name: id, aliases: [], category, difficulty };
}

const CATEGORIES = ['a', 'b', 'c', 'd', 'e', 'f'];
const POOL: Identity[] = [];
for (const category of CATEGORIES) {
  for (const difficulty of ['easy', 'medium', 'hard'] as const) {
    for (let i = 0; i < 3; i++) POOL.push(identity(`${category}-${difficulty}-${i}`, category, difficulty));
  }
}
const PLAYERS = ['p1', 'p2', 'p3', 'p4', 'p5'];

describe('the draw', () => {
  it('gives each player one identity, never the same one twice', () => {
    for (let seed = 1; seed <= 25; seed++) {
      const drawn = drawIdentities(POOL, PLAYERS, { gameNumber: 1, hardIdentities: false, rng: seeded(seed) });
      expect(drawn).toHaveLength(PLAYERS.length);
      expect(new Set(drawn.map((d) => d.id)).size).toBe(PLAYERS.length);
    }
  });

  it('never repeats a category while the pool has an unused one', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const drawn = drawIdentities(POOL, PLAYERS, { gameNumber: 2, hardIdentities: false, rng: seeded(seed) });
      expect(new Set(drawn.map((d) => d.category)).size).toBe(PLAYERS.length);
    }
  });

  it('repeats a category only once the categories run out', () => {
    const eight = ['1', '2', '3', '4', '5', '6', '7', '8'];
    const drawn = drawIdentities(POOL, eight, { gameNumber: 2, hardIdentities: false, rng: seeded(9) });
    expect(drawn).toHaveLength(8);
    // six categories exist, so the first six are all different
    expect(new Set(drawn.slice(0, 6).map((d) => d.category)).size).toBe(6);
  });

  it('draws only easy identities in the first game', () => {
    for (let seed = 1; seed <= 25; seed++) {
      const drawn = drawIdentities(POOL, PLAYERS, { gameNumber: 1, hardIdentities: false, rng: seeded(seed) });
      expect(drawn.every((d) => d.difficulty === 'easy')).toBe(true);
    }
  });

  it('draws easy and medium from the second game, and hard only with the setting', () => {
    expect(difficultiesFor(1, false)).toEqual(['easy']);
    expect(difficultiesFor(2, false)).toEqual(['easy', 'medium']);
    expect(difficultiesFor(3, true)).toEqual(['easy', 'medium', 'hard']);
    const seen = new Set<string>();
    for (let seed = 1; seed <= 60; seed++) {
      for (const d of drawIdentities(POOL, PLAYERS, { gameNumber: 4, hardIdentities: false, rng: seeded(seed) })) {
        seen.add(d.difficulty);
      }
    }
    expect([...seen].sort()).toEqual(['easy', 'medium']);
    const withHard = new Set<string>();
    for (let seed = 1; seed <= 60; seed++) {
      for (const d of drawIdentities(POOL, PLAYERS, { gameNumber: 4, hardIdentities: true, rng: seeded(seed) })) {
        withHard.add(d.difficulty);
      }
    }
    expect(withHard.has('hard')).toBe(true);
  });

  it('falls back to the whole list when the difficulty pool is too small', () => {
    const small = [identity('x1', 'a', 'easy'), identity('x2', 'b', 'hard'), identity('x3', 'c', 'hard')];
    const drawn = drawIdentities(small, ['p1', 'p2', 'p3'], { gameNumber: 1, hardIdentities: false, rng: seeded(3) });
    expect(drawn).toHaveLength(3);
  });

  it('draws fewer than asked when even the whole list is too small', () => {
    const drawn = drawIdentities([identity('x1', 'a', 'easy')], ['p1', 'p2'], { gameNumber: 1, hardIdentities: false });
    expect(drawn).toHaveLength(1);
  });
});

describe('turn order', () => {
  it('is a permutation of the players', () => {
    const order = turnOrder(PLAYERS, seeded(5));
    expect([...order].sort()).toEqual([...PLAYERS].sort());
    expect(turnOrder(PLAYERS, seeded(5))).toEqual(order);
  });

  it('seats a slot by round and seat', () => {
    expect(seatAt(['a', 'b', 'c'], 0)).toBe('a');
    expect(seatAt(['a', 'b', 'c'], 4)).toBe('b');
    expect(seatAt([], 0)).toBeUndefined();
    expect(seatAt(['a'], -1)).toBeUndefined();
  });
});

describe('plurality', () => {
  it('names the answer with the most votes', () => {
    expect(plurality(tally(['yes', 'yes', 'no']))).toBe('yes');
    expect(plurality(tally(['no', 'maybe', 'no', 'yes']))).toBe('no');
    expect(plurality(tally(['maybe']))).toBe('maybe');
  });

  it('reads any tie for the top as Split, and no votes as Split', () => {
    expect(plurality(tally(['yes', 'no']))).toBe('split');
    expect(plurality(tally(['yes', 'no', 'maybe']))).toBe('split');
    expect(plurality(tally(['yes', 'yes', 'no', 'no', 'maybe']))).toBe('split');
    expect(plurality(tally([]))).toBe('split');
  });

  it('counts each vote once', () => {
    expect(tally(['yes', 'no', 'no', 'maybe', 'yes', 'yes'])).toEqual({ yes: 3, no: 2, maybe: 1 });
  });
});

describe('member text', () => {
  it('strips control characters and collapses whitespace', () => {
    expect(cleanText('  Am \t I\n\n a\u0000 real\u0007  person? ')).toBe('Am I a real person?');
    expect(cleanText('a\u2028b')).toBe('a b');
  });

  it('accepts a question of 3 to 200 characters after cleaning', () => {
    expect(cleanQuestion('Am I?')).toBe('Am I?');
    expect(cleanQuestion('  ab  ')).toBeNull();
    expect(cleanQuestion('\u0001\u0002 \n ')).toBeNull();
    expect(cleanQuestion('x'.repeat(200))).toBe('x'.repeat(200));
    expect(cleanQuestion('x'.repeat(201))).toBeNull();
    // length is counted in characters, not UTF-16 units
    expect(cleanQuestion('😀'.repeat(200))).not.toBeNull();
    expect(cleanQuestion('😀'.repeat(201))).toBeNull();
  });

  it('accepts a guess of 1 to 100 characters after cleaning', () => {
    expect(cleanGuess(' einstein ')).toBe('einstein');
    expect(cleanGuess('   ')).toBeNull();
    expect(cleanGuess('y'.repeat(101))).toBeNull();
  });
});

describe('matching a guess', () => {
  const einstein: Identity = {
    id: 'albert-einstein',
    name: 'Albert Einstein',
    aliases: ['einstein'],
    category: 'scientist',
    difficulty: 'easy',
  };
  const equal: GuessMatcher = (guess, id) => [id.name, ...id.aliases].map(normalizeForMatch).includes(guess);

  it('normalises case, accents and punctuation', () => {
    expect(normalizeForMatch('  Beyoncé!! ')).toBe('beyonce');
    expect(normalizeForMatch("Shaquille O'Neal")).toBe('shaquille o neal');
  });

  it('hands the matcher the normalised guess', () => {
    expect(judgeGuess('  EINSTEIN ', einstein, equal)).toEqual({ text: 'EINSTEIN', correct: true });
    expect(judgeGuess('Marie Curie', einstein, equal)).toEqual({ text: 'Marie Curie', correct: false });
  });

  it('is not a guess when the text is empty, and never right when it is under three letters', () => {
    expect(judgeGuess('   ', einstein, equal)).toBeNull();
    let called = false;
    const spy: GuessMatcher = () => {
      called = true;
      return true;
    };
    expect(judgeGuess('al', einstein, spy)).toEqual({ text: 'al', correct: false });
    expect(called).toBe(false);
  });
});

describe('scoring', () => {
  it('pays 200 plus up to 300 for an early correct guess, by the slots left', () => {
    expect(earlyCorrectPoints(3, 3)).toBe(500);
    expect(earlyCorrectPoints(2, 3)).toBe(400);
    expect(earlyCorrectPoints(1, 3)).toBe(300);
    expect(earlyCorrectPoints(0, 3)).toBe(200);
    expect(earlyCorrectPoints(5, 5)).toBe(500);
    expect(earlyCorrectPoints(1, 4)).toBe(275);
  });

  it('never pays beyond the bounds when slots are out of range', () => {
    expect(earlyCorrectPoints(9, 3)).toBe(500);
    expect(earlyCorrectPoints(-1, 3)).toBe(200);
    expect(earlyCorrectPoints(1, 0)).toBe(200);
  });

  it('costs 100 for a wrong early guess and pays 200 for a correct final guess', () => {
    expect(EARLY_WRONG_POINTS).toBe(-100);
    expect(FINAL_CORRECT_POINTS).toBe(200);
  });

  it('pays 20 for each question slot not used', () => {
    expect(efficiencyPoints(0)).toBe(0);
    expect(efficiencyPoints(2)).toBe(40);
    expect(efficiencyPoints(-3)).toBe(0);
  });
});

describe('the input schemas and the settings', () => {
  it('reads the three inputs', () => {
    expect(AskInputSchema.safeParse({ text: 'Am I alive?' }).success).toBe(true);
    expect(AskInputSchema.safeParse({}).success).toBe(false);
    expect(VoteInputSchema.safeParse({ vote: 'maybe' }).success).toBe(true);
    expect(VoteInputSchema.safeParse({ vote: 'sure' }).success).toBe(false);
    expect(GuessInputSchema.safeParse({ text: 'einstein' }).success).toBe(true);
    expect(GuessInputSchema.safeParse({ text: 5 }).success).toBe(false);
  });

  it('declares the three host settings with their bounds', () => {
    const byKey = Object.fromEntries(IDENTITY_CRISIS_SETTINGS.map((s) => [s.key, s]));
    expect(Object.keys(byKey).sort()).toEqual(['askSeconds', 'hardIdentities', 'questionsPerPlayer']);
    expect(byKey.questionsPerPlayer).toMatchObject({ default: 3, min: 2, max: 5 });
    expect(byKey.askSeconds).toMatchObject({ default: 20, min: 10, max: 40 });
    expect(byKey.hardIdentities).toMatchObject({ type: 'boolean', default: false });
    const result = validateGameSettings(IDENTITY_CRISIS_SETTINGS, { questionsPerPlayer: 9, askSeconds: 1 });
    expect(result).toBeDefined();
  });
});
