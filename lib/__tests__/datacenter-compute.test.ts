import { describe, it, expect } from 'vitest';

/**
 * RMH Datacenter's compute shop (W2).
 *
 * The pure half: the price list's own invariants, the month key that decides
 * which window a grant belongs to, and the meter arithmetic — which has one
 * job beyond dividing, and that is never reading over 100%.
 */

import {
  COMPUTE_PACKS,
  MAX_PACKS_PER_MONTH,
  monthKey,
  packById,
  totalGrants,
  utilisation,
} from '@/lib/datacenter/compute';

describe('the price list', () => {
  it('has unique ids', () => {
    const ids = COMPUTE_PACKS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('charges something for everything', () => {
    for (const p of COMPUTE_PACKS) {
      expect({ id: p.id, positive: p.coins > 0 }).toEqual({ id: p.id, positive: true });
    }
  });

  it('gives something for every price', () => {
    for (const p of COMPUTE_PACKS) {
      const gives = p.aiMicros + p.imageGens + p.librarySlots;
      expect({ id: p.id, gives: gives > 0 }).toEqual({ id: p.id, gives: true });
    }
  });

  it('gets better per coin as the pack gets bigger', () => {
    // Otherwise the large packs are a worse deal than buying the small one
    // repeatedly, which makes the tiers decorative.
    const rates = COMPUTE_PACKS.map((p) => p.aiMicros / p.coins);
    for (let i = 1; i < rates.length; i++) {
      expect(rates[i]).toBeGreaterThanOrEqual(rates[i - 1]);
    }
  });

  it('resolves a pack by id, and nothing else', () => {
    expect(packById('burst')?.id).toBe('burst');
    expect(packById('nope')).toBeUndefined();
  });

  it('caps how much can be bought in a month', () => {
    // Without a ceiling, a large balance converts into an unbounded provider
    // bill in one afternoon and the first anybody knows is the invoice.
    expect(MAX_PACKS_PER_MONTH).toBeGreaterThan(0);
    expect(MAX_PACKS_PER_MONTH).toBeLessThanOrEqual(50);
  });
});

describe('monthKey', () => {
  it('formats as YYYY-MM in UTC', () => {
    expect(monthKey(new Date('2026-09-19T12:00:00Z'))).toBe('2026-09');
    expect(monthKey(new Date('2026-01-01T00:00:00Z'))).toBe('2026-01');
  });

  it('pads single-digit months', () => {
    expect(monthKey(new Date('2026-03-05T00:00:00Z'))).toBe('2026-03');
  });

  it('uses UTC rather than local time at the boundary', () => {
    // 23:30 UTC on 31 January is still January here — the window a grant
    // belongs to has to agree with the SQL that filters on it, and that is UTC.
    expect(monthKey(new Date('2026-01-31T23:30:00Z'))).toBe('2026-01');
  });
});

describe('totalGrants', () => {
  it('is zero for nothing', () => {
    expect(totalGrants([])).toEqual({ aiMicros: 0, imageGens: 0, librarySlots: 0 });
  });

  it('adds every field', () => {
    expect(
      totalGrants([
        { aiMicros: 100, imageGens: 5, librarySlots: 1 },
        { aiMicros: 250, imageGens: 0, librarySlots: 4 },
      ]),
    ).toEqual({ aiMicros: 350, imageGens: 5, librarySlots: 5 });
  });
});

describe('utilisation', () => {
  it('divides', () => {
    expect(utilisation(50, 200)).toBe(0.25);
  });

  it('never reads over full', () => {
    // A meter that can show 140% is a meter nobody believes. Over capacity
    // reads as full, which is both true and the thing worth knowing.
    expect(utilisation(300, 200)).toBe(1);
  });

  it('never reads negative', () => {
    expect(utilisation(-10, 200)).toBe(0);
  });

  it('reads empty rather than dividing by zero', () => {
    expect(utilisation(10, 0)).toBe(0);
  });
});
