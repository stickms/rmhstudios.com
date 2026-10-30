import { describe, expect, it } from 'vitest';
import {
  BUY_UNIT_GEMS,
  FOIL_GEMS,
  GEMS_PER_CARD,
  PACK_COST,
  PACK_SIZE,
  coinCostFor,
  drawPack,
  gemValue,
  validateBuyUnits,
} from '../gems';
import { SET_SIZE } from '../cards';

describe('values', () => {
  it('a foil is worth four normal cards', () => {
    expect(gemValue(false)).toBe(GEMS_PER_CARD);
    expect(gemValue(true)).toBe(FOIL_GEMS);
    expect(FOIL_GEMS).toBe(GEMS_PER_CARD * 4);
  });

  it('a pack costs ten cards’ worth and yields three, so unpacking is deflationary for cards', () => {
    expect(PACK_COST / GEMS_PER_CARD).toBeGreaterThan(PACK_SIZE);
  });

  it('gems cost one coin each, in units of one hundred', () => {
    expect(coinCostFor(1)).toBe(BUY_UNIT_GEMS);
    expect(coinCostFor(5)).toBe(5 * BUY_UNIT_GEMS);
  });
});

describe('validateBuyUnits', () => {
  it('takes whole units from 1 to 10', () => {
    expect(validateBuyUnits(1)).toBe(true);
    expect(validateBuyUnits(10)).toBe(true);
    expect(validateBuyUnits(0)).toBe(false);
    expect(validateBuyUnits(11)).toBe(false);
    expect(validateBuyUnits(1.5)).toBe(false);
    expect(validateBuyUnits(Number.NaN)).toBe(false);
  });
});

describe('drawPack', () => {
  const seq = (...vals: number[]) => {
    let i = 0;
    return (max: number) => vals[i++ % vals.length] % max;
  };

  it('draws a pack of cards from the set with the random source it is given', () => {
    const cards = drawPack(seq(0, 5, 2, 1, 3, 4));
    expect(cards).toHaveLength(PACK_SIZE);
    for (const c of cards) {
      expect(c.cardIndex).toBeGreaterThanOrEqual(0);
      expect(c.cardIndex).toBeLessThan(SET_SIZE);
    }
  });

  it('is deterministic for a fixed source', () => {
    expect(drawPack(seq(3, 1, 4, 1, 5, 9))).toEqual(drawPack(seq(3, 1, 4, 1, 5, 9)));
  });

  it('is foil on a one-in-twenty roll, and only then', () => {
    // Each card consumes two values: the card, then the foil roll (0 means foil).
    const allFoil = drawPack(seq(2, 0));
    expect(allFoil.every((c) => c.foil)).toBe(true);
    const noFoil = drawPack(seq(2, 7));
    expect(noFoil.every((c) => !c.foil)).toBe(true);
  });

  it('with a real uniform source, foils appear about one in twenty', () => {
    let foils = 0;
    const N = 4000;
    for (let i = 0; i < N; i++) for (const c of drawPack((m) => Math.floor(Math.random() * m))) if (c.foil) foils++;
    const rate = foils / (N * PACK_SIZE);
    expect(rate).toBeGreaterThan(0.03);
    expect(rate).toBeLessThan(0.07);
  });
});
