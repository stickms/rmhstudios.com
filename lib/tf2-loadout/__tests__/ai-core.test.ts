import { describe, expect, it } from 'vitest';
import { TF_CLASSES, type Catalog, type CatalogItem } from '../catalog-types';
import {
  describeCandidates,
  heuristicSuggest,
  selectCandidates,
  validateActions,
  wordsOf,
} from '../ai-core';

const bit = (cls: (typeof TF_CLASSES)[number]) => 1 << TF_CLASSES.indexOf(cls);
const it_ = (id: number, n: string, over: Partial<CatalogItem>): CatalogItem => ({
  id,
  n,
  t: 'x',
  q: 'unique',
  s: 'misc',
  c: 0b111111111,
  ...over,
});
const catalog: Catalog = {
  v: 1,
  source: { label: 't', hash: 'h', builtAt: '', hasIcons: false },
  items: [
    it_(13, 'Scattergun', { s: 'primary', c: bit('scout') }),
    it_(0, 'Bat', { s: 'melee', c: bit('scout') }),
    it_(18, 'Rocket Launcher', { s: 'primary', c: bit('soldier') }),
    it_(100, 'Pumpkin Hat', { s: 'head', r: ['hat'], p: 1 }),
    it_(101, 'Spooky Pumpkin Mask', { s: 'head', r: ['hat', 'face'] }),
    it_(102, 'Scarf', { s: 'misc', r: ['neck'], p: 1 }),
    it_(103, 'Goggles', { s: 'misc', r: ['face'] }),
    it_(104, 'Sneakers', { s: 'misc', r: ['feet'] }),
    it_(200, 'Laugh Taunt', { s: 'taunt' }),
  ],
  paints: [{ id: 5000, n: 'Team Spirit', rgb: '#ff0000' }],
  effects: [{ id: 13, n: 'Burning Flames' }],
  conflicts: { hat: ['face'], face: ['hat'] },
};

describe('selectCandidates', () => {
  it("lists only what the class can use, and the player's words come first", () => {
    const c = selectCandidates(catalog, 'scout', 'a spooky pumpkin look');
    expect(c.weapons.map((i) => i.id).sort()).toEqual([0, 13]);
    expect(c.cosmetics[0].n).toMatch(/pumpkin/i);
    expect(c.taunts.map((i) => i.id)).toEqual([200]);
  });

  it('describes each item on one line with its slot, regions and paintability', () => {
    const text = describeCandidates(selectCandidates(catalog, 'scout', ''), 'scout');
    expect(text).toContain('100|Pumpkin Hat|head|hat|paintable');
    expect(text).toContain('5000|Team Spirit');
    expect(text).toContain('13|Burning Flames');
  });
});

describe('validateActions', () => {
  it('keeps real equips and fills a missing slot with the next free one', () => {
    const r = validateActions(
      catalog,
      'scout',
      [{ item: 13 }, { item: 100, paint: 5000 }, { item: 102 }],
      { cosmetic1: { item: 104 } },
    );
    expect(r.actions).toEqual([
      { slot: 'primary', item: 13 },
      { slot: 'cosmetic2', item: 100, paint: 5000 },
      { slot: 'cosmetic3', item: 102 },
    ]);
    expect(r.dropped).toBe(0);
  });

  it('drops anything invented or unusable instead of applying it', () => {
    const r = validateActions(
      catalog,
      'scout',
      [
        { item: 999 }, // not in the catalog
        { item: 18 }, // a Soldier weapon
        { item: 'x' },
        null,
        { item: 13, slot: 'melee' }, // a primary named as a melee: placed where it belongs
        { item: 103, paint: 5000 }, // not paintable: the item stays, the paint goes
        { item: 100, effect: 1 }, // unknown effect
      ],
      {},
    );
    expect(r.actions.map((a) => [a.item, a.slot, a.paint, a.effect])).toEqual([
      [13, 'primary', undefined, undefined],
      [103, 'cosmetic1', undefined, undefined],
      [100, 'cosmetic2', undefined, undefined],
    ]);
    expect(r.dropped).toBe(4);
  });

  it('allows a known effect on a cosmetic and not on a weapon', () => {
    const r = validateActions(catalog, 'scout', [{ item: 100, effect: 13 }, { item: 13, effect: 13 }], {});
    expect(r.actions.find((a) => a.item === 100)?.effect).toBe(13);
    expect(r.actions.find((a) => a.item === 13)?.effect).toBeUndefined();
  });

  it('never returns more than the limit, and tolerates non-array input', () => {
    const many = Array.from({ length: 40 }, () => ({ item: 100 }));
    expect(validateActions(catalog, 'scout', many, {}).actions.length).toBeLessThanOrEqual(12);
    expect(validateActions(catalog, 'scout', 'nope', {})).toEqual({ actions: [], dropped: 0 });
  });
});

describe('heuristicSuggest', () => {
  it('suggests name matches without overlapping regions', () => {
    const r = heuristicSuggest(catalog, 'scout', 'pumpkin', {});
    expect(r.matched).toEqual(['Pumpkin Hat']); // the Mask shares "hat" with it
  });

  it('says nothing when nothing matches or only filler was typed', () => {
    expect(heuristicSuggest(catalog, 'scout', 'zzzz', {}).actions).toEqual([]);
    expect(heuristicSuggest(catalog, 'scout', 'make me a loadout', {}).actions).toEqual([]);
  });
});

describe('wordsOf', () => {
  it('drops filler and short words and repeats', () => {
    expect(wordsOf('Give me the spooky spooky hat!')).toEqual(['spooky', 'hat']);
  });
});
