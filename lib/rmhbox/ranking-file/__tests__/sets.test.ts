import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { RankingSetSchema, RF_CATEGORIES, RF_ITEMS_PER_ROUND } from '../schemas';
import { buildRound, loadSets, selectRoundsForGame } from '../set-loader';

const raw = JSON.parse(
  readFileSync(join(process.cwd(), 'data', 'rmhbox', 'ranking-file', 'sets.json'), 'utf-8'),
) as unknown[];

describe('ranking-file pack', () => {
  it('has at least 60 sets, every one valid', () => {
    expect(raw.length).toBeGreaterThanOrEqual(60);
    for (const entry of raw) {
      const result = RankingSetSchema.safeParse(entry);
      expect(result.success, result.success ? '' : result.error.message).toBe(true);
    }
  });

  it('has unique ids and every set loads', () => {
    const ids = raw.map((s) => (s as { id: string }).id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(loadSets().length).toBe(raw.length);
  });

  it('gives every set 6 to 8 items with distinct values and labels, a known category, a unit and a source', () => {
    for (const set of loadSets()) {
      expect(set.items.length, set.id).toBeGreaterThanOrEqual(6);
      expect(set.items.length, set.id).toBeLessThanOrEqual(8);
      expect(new Set(set.items.map((i) => i.value)).size, set.id).toBe(set.items.length);
      expect(new Set(set.items.map((i) => i.label)).size, set.id).toBe(set.items.length);
      expect(RF_CATEGORIES, set.id).toContain(set.category);
      expect(set.unit.length, set.id).toBeGreaterThan(0);
      expect(set.source.trim().length, set.id).toBeGreaterThan(0);
    }
  });

  it('covers every category with at least ten sets', () => {
    for (const category of RF_CATEGORIES) {
      expect(loadSets().filter((s) => s.category === category).length, category).toBeGreaterThanOrEqual(10);
    }
  });

  it('keeps clear of values that change: no populations or prices', () => {
    for (const set of loadSets()) {
      expect(`${set.prompt} ${set.unit}`.toLowerCase(), set.id).not.toMatch(
        /population|price|cost|gdp|revenue|net worth|box office|sales/,
      );
    }
  });
});

describe('the schema refuses a set with two equal values', () => {
  const base = {
    id: 'x',
    category: 'science',
    prompt: 'Largest to smallest thing',
    unit: 'km',
    source: 'A source',
    items: [1, 2, 3, 4, 5, 6].map((v) => ({ label: `item ${v}`, value: v })),
  };
  it('accepts distinct values', () => {
    expect(RankingSetSchema.safeParse(base).success).toBe(true);
  });
  it('refuses equal values, fewer than six items and a missing source', () => {
    expect(
      RankingSetSchema.safeParse({ ...base, items: [...base.items.slice(0, 5), { label: 'item 7', value: 3 }] })
        .success,
    ).toBe(false);
    expect(RankingSetSchema.safeParse({ ...base, items: base.items.slice(0, 5) }).success).toBe(false);
    expect(RankingSetSchema.safeParse({ ...base, source: '' }).success).toBe(false);
  });
});

describe('round drawing', () => {
  it('draws five items, official order largest first, display never equal to it', () => {
    for (const set of loadSets()) {
      for (let i = 0; i < 5; i++) {
        const round = buildRound(set);
        expect(round.official).toHaveLength(RF_ITEMS_PER_ROUND);
        const values = round.official.map((item) => item.value);
        expect(values).toEqual([...values].sort((a, b) => b - a));
        expect(new Set(round.display)).toEqual(new Set(round.official.map((item) => item.label)));
        expect(round.display).not.toEqual(round.official.map((item) => item.label));
      }
    }
  });

  it('picks distinct sets for a match and plays unseen ones first', () => {
    const pool = loadSets();
    const first = selectRoundsForGame(pool, new Set(), 8);
    expect(new Set(first.map((r) => r.setId)).size).toBe(8);
    const used = new Set(first.map((r) => r.setId));
    const second = selectRoundsForGame(pool, used, 8);
    expect(second.every((r) => !used.has(r.setId))).toBe(true);
  });

  it('honours a category and makes up a shortfall from the rest', () => {
    const pool = loadSets();
    const science = selectRoundsForGame(pool, new Set(), 8, 'science');
    expect(science.every((r) => r.category === 'science')).toBe(true);
    const small = pool
      .filter((s) => s.category === 'culture')
      .slice(0, 2)
      .concat(pool.filter((s) => s.category !== 'culture'));
    const mixed = selectRoundsForGame(small, new Set(), 5, 'culture');
    expect(mixed).toHaveLength(5);
    expect(mixed.filter((r) => r.category === 'culture')).toHaveLength(2);
  });
});
