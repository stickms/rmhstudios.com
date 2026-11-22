/**
 * Seeding order (s05-18), pure: every method's order, ties, unrated entrants,
 * partial and stale manual orders, a deterministic shuffle with an injected rng,
 * the stored-order helper and the crypto rng's range.
 */
import { describe, expect, it } from 'vitest';
import {
  cryptoRng,
  DEFAULT_RATING,
  isSeedingMethod,
  manualOrderOf,
  orderEntrants,
  type Rng,
} from '@/lib/tournaments/seeding';
import { updateSeedingSchema } from '@/lib/tournaments/seeding-schema';

const field = ['a', 'b', 'c', 'd', 'e'].map((n) => ({ id: `e-${n}`, userId: `u-${n}` }));
const ids = (list: readonly { id: string }[]) => list.map((e) => e.id);

describe('join', () => {
  it('keeps sign-up order and does not mutate the input', () => {
    const copy = [...field];
    expect(ids(orderEntrants('join', field))).toEqual(ids(field));
    expect(field).toEqual(copy);
  });
});

describe('rating', () => {
  it('puts the highest rating first', () => {
    const ratings = new Map([
      ['u-a', 1100],
      ['u-b', 1500],
      ['u-c', 900],
      ['u-d', 1300],
      ['u-e', 1200],
    ]);
    expect(ids(orderEntrants('rating', field, ratings))).toEqual(['e-b', 'e-d', 'e-e', 'e-a', 'e-c']);
  });

  it('breaks ties by sign-up order', () => {
    const ratings = new Map([
      ['u-a', 1200],
      ['u-b', 1200],
      ['u-c', 1400],
      ['u-d', 1200],
      ['u-e', 1400],
    ]);
    expect(ids(orderEntrants('rating', field, ratings))).toEqual(['e-c', 'e-e', 'e-a', 'e-b', 'e-d']);
  });

  it('counts an unrated member as the model default, between the rated above and below it', () => {
    expect(DEFAULT_RATING).toBe(1000);
    const ratings = new Map([
      ['u-b', 1001],
      ['u-d', 999],
    ]);
    expect(ids(orderEntrants('rating', field, ratings))).toEqual(['e-b', 'e-a', 'e-c', 'e-e', 'e-d']);
  });

  it('is sign-up order when nobody is rated', () => {
    expect(ids(orderEntrants('rating', field))).toEqual(ids(field));
  });
});

/** An rng that replays a fixed list of draws. */
function scripted(draws: number[]): Rng {
  let i = 0;
  return (max) => {
    const n = draws[i++];
    if (n === undefined || n >= max) throw new Error(`bad scripted draw ${n} for ${max}`);
    return n;
  };
}

describe('random', () => {
  it('is a Fisher-Yates shuffle over the injected rng, so the same draws give the same order', () => {
    const draws = [0, 2, 1, 0];
    const first = orderEntrants('random', field, new Map(), [], scripted(draws));
    const again = orderEntrants('random', field, new Map(), [], scripted(draws));
    expect(ids(first)).toEqual(ids(again));
    // i=4 swap with 0, i=3 with 2, i=2 with 1, i=1 with 0.
    expect(ids(first)).toEqual(['e-d', 'e-e', 'e-b', 'e-c', 'e-a']);
  });

  it('draws from the right ranges and uses every entrant once', () => {
    const maxes: number[] = [];
    const out = orderEntrants('random', field, new Map(), [], (max) => {
      maxes.push(max);
      return max - 1;
    });
    expect(maxes).toEqual([5, 4, 3, 2]);
    expect([...ids(out)].sort()).toEqual([...ids(field)].sort());
  });

  it('leaves one entrant and none alone without drawing', () => {
    const never: Rng = () => {
      throw new Error('no draw expected');
    };
    expect(orderEntrants('random', [], new Map(), [], never)).toEqual([]);
    expect(ids(orderEntrants('random', field.slice(0, 1), new Map(), [], never))).toEqual(['e-a']);
  });

  it('the default rng stays in range and reaches both ends', () => {
    const seen = new Set<number>();
    for (let i = 0; i < 400; i++) seen.add(cryptoRng(3));
    expect([...seen].sort()).toEqual([0, 1, 2]);
    expect(cryptoRng(1)).toBe(0);
    expect(() => cryptoRng(0)).toThrow(RangeError);
  });
});

describe('manual', () => {
  it('uses a full order exactly', () => {
    const order = ['e-d', 'e-a', 'e-e', 'e-c', 'e-b'];
    expect(ids(orderEntrants('manual', field, new Map(), order))).toEqual(order);
  });

  it('appends anyone not placed in sign-up order', () => {
    expect(ids(orderEntrants('manual', field, new Map(), ['e-d', 'e-b']))).toEqual(['e-d', 'e-b', 'e-a', 'e-c', 'e-e']);
  });

  it('is sign-up order with no order, and skips unknown or repeated ids', () => {
    expect(ids(orderEntrants('manual', field, new Map(), []))).toEqual(ids(field));
    expect(ids(orderEntrants('manual', field, new Map(), ['gone', 'e-c', 'e-c', 'e-a']))).toEqual([
      'e-c',
      'e-a',
      'e-b',
      'e-d',
      'e-e',
    ]);
  });
});

describe('manualOrderOf', () => {
  it('reads stored seeds lowest first, ties by sign-up order, ignoring unplaced entrants', () => {
    expect(
      manualOrderOf([
        { id: 'a', manualSeed: 2 },
        { id: 'b', manualSeed: null },
        { id: 'c', manualSeed: 1 },
        { id: 'd', manualSeed: 2 },
      ]),
    ).toEqual(['c', 'a', 'd']);
  });
});

describe('inputs', () => {
  it('knows the four methods and nothing else', () => {
    for (const m of ['join', 'rating', 'random', 'manual']) expect(isSeedingMethod(m)).toBe(true);
    expect(isSeedingMethod('elo')).toBe(false);
    expect(isSeedingMethod(undefined)).toBe(false);
  });

  it('the update schema needs a method or an order, and no entrant twice', () => {
    expect(updateSeedingSchema.safeParse({}).success).toBe(false);
    expect(updateSeedingSchema.safeParse({ method: 'elo' }).success).toBe(false);
    expect(updateSeedingSchema.safeParse({ method: 'rating' }).success).toBe(true);
    expect(updateSeedingSchema.safeParse({ order: ['a', 'b'] }).success).toBe(true);
    expect(updateSeedingSchema.safeParse({ order: ['a', 'a'] }).success).toBe(false);
    expect(updateSeedingSchema.safeParse({ order: Array.from({ length: 65 }, (_, i) => `e${i}`) }).success).toBe(false);
  });
});
