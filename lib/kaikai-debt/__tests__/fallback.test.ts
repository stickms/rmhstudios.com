/**
 * The fallback generator.
 *
 * This is the component that makes "the scroll never ends" a property of the
 * code rather than a hope about DeepSeek's uptime, so what it must never do is
 * more interesting than what it does: never throw, never return short, never
 * emit a row the database would reject. Every assertion below is one of those.
 */

import { describe, expect, it } from 'vitest';
import { generateFallbackReceipts, FALLBACK_VARIETY } from '@/lib/kaikai-debt/fallback';
import {
  DEBT_CATEGORIES,
  MAX_ITEM_CHARS,
  MAX_NOTE_CHARS,
  MAX_RECEIPT_CENTS,
  MIN_RECEIPT_CENTS,
} from '@/lib/kaikai-debt/debt';

function seeded(seed = 12345): () => number {
  let state = seed;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 0x1_0000_0000;
  };
}

describe('generateFallbackReceipts', () => {
  const batch = generateFallbackReceipts(200, ['ren', 'kai', 'sam'], seeded());

  it('returns exactly as many rows as asked for', () => {
    // The whole point. A short batch is a scroll that stops.
    expect(batch).toHaveLength(200);
    expect(generateFallbackReceipts(1, [], seeded())).toHaveLength(1);
  });

  it('is unfazed by degenerate counts instead of throwing', () => {
    for (const count of [0, -5, Number.NaN]) {
      expect(() => generateFallbackReceipts(count, [], seeded())).not.toThrow();
      expect(generateFallbackReceipts(count, [], seeded())).toEqual([]);
    }
  });

  it('emits rows the database will accept', () => {
    for (const row of batch) {
      expect(row.item.length).toBeGreaterThan(0);
      expect(row.item.length).toBeLessThanOrEqual(MAX_ITEM_CHARS);
      expect(row.note.length).toBeGreaterThan(0);
      expect(row.note.length).toBeLessThanOrEqual(MAX_NOTE_CHARS);
      expect(DEBT_CATEGORIES).toContain(row.category);
      expect(Number.isInteger(row.amountCents)).toBe(true);
      expect(row.amountCents).toBeGreaterThanOrEqual(MIN_RECEIPT_CENTS);
      expect(row.amountCents).toBeLessThanOrEqual(MAX_RECEIPT_CENTS);
    }
  });

  it('draws amounts from the same $5-skewed distribution as the model path', () => {
    // A fallback batch must be statistically indistinguishable from a generated
    // one — the distribution is a property of the ledger, not of who wrote the
    // prose. If these diverged, an outage would be visible in the numbers.
    const sorted = batch.map((r) => r.amountCents).sort((a, b) => a - b);
    expect(sorted[Math.floor(sorted.length * 0.5)]).toBeLessThan(1500);
  });

  it('names real members in some notes but not all of them', () => {
    const named = batch.filter((r) => /@(ren|kai|sam)\b/.test(r.note)).length;
    // Roughly a third, generously bounded: all-or-nothing would read as a
    // template with a name slotted into every row.
    expect(named).toBeGreaterThan(20);
    expect(named).toBeLessThan(160);
  });

  it('never invents a handle it was not given', () => {
    for (const row of batch) {
      for (const [, handle] of row.note.matchAll(/@([\w-]+)/g)) {
        expect(['ren', 'kai', 'sam']).toContain(handle);
      }
    }
  });

  it('stays impersonal when there are no members to name', () => {
    const anonymous = generateFallbackReceipts(50, [], seeded());
    expect(anonymous.every((r) => !r.note.includes('@'))).toBe(true);
  });

  it('does not visibly repeat itself over a long scroll', () => {
    // Two hundred rows is about ten pages — well past where a reader would
    // notice a loop. A handful of collisions is fine; a wall of them is the
    // failure this guards.
    const distinct = new Set(batch.map((r) => `${r.item}|${r.note}`));
    expect(distinct.size).toBeGreaterThan(150);
  });

  it('has enough combinations that a long session never exhausts it', () => {
    expect(FALLBACK_VARIETY).toBeGreaterThan(10_000);
  });

  it('is reproducible for a given seed', () => {
    expect(generateFallbackReceipts(10, ['ren'], seeded(99))).toEqual(
      generateFallbackReceipts(10, ['ren'], seeded(99)),
    );
  });
});
