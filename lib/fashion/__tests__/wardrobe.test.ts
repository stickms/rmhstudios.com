/**
 * The wardrobe's rules and its catalogue.
 *
 * The catalogue checks matter more than they look: a garment naming a segment
 * that does not exist, or a span running backwards, produces no error at all —
 * it produces an invisible garment, which is the hardest kind of bug to notice
 * in a picture of a person wearing several things.
 */

import { describe, expect, it } from 'vitest';
import { CATEGORY_ORDER, GARMENTS, getGarment } from '../garments';
import { SWATCHES, isSwatch } from '../palette';
import { PAIRED_SEGMENTS, buildFigure, DEFAULT_FIGURE } from '../figure';
import {
  applyPreset,
  byCategory,
  defaultOutfit,
  dye,
  isWorn,
  layered,
  PRESETS,
  remove,
  setFigure,
  wear,
} from '../wardrobe';

describe('the catalogue', () => {
  it('has garments, with unique ids', () => {
    expect(GARMENTS.length).toBeGreaterThan(30);
    expect(new Set(GARMENTS.map((g) => g.id)).size).toBe(GARMENTS.length);
  });

  it('covers every category the rail lays out, and no orphans', () => {
    const used = new Set(GARMENTS.map((g) => g.category));
    for (const category of used) expect(CATEGORY_ORDER).toContain(category);
    expect(byCategory().flatMap((g) => g.garments)).toHaveLength(GARMENTS.length);
  });

  it.each(GARMENTS.map((g) => [g.id, g] as const))('%s is well formed', (_id, garment) => {
    expect(garment.slots.length).toBeGreaterThan(0);
    expect(isSwatch(garment.swatch)).toBe(true);
    expect(garment.offset).toBeGreaterThan(0);
    // A trinket is a wire primitive and covers nothing; everything else must
    // cover something, or it is a garment that renders as nothing at all.
    if (garment.trinket) expect(garment.pieces).toHaveLength(0);
    else expect(garment.pieces.length).toBeGreaterThan(0);

    const segments = buildFigure(DEFAULT_FIGURE);
    for (const piece of garment.pieces) {
      expect(
        segments.some((s) => s.id === piece.segment),
        `${garment.id} covers "${piece.segment}", which is not part of the figure`,
      ).toBe(true);
      expect(piece.from).toBeGreaterThanOrEqual(0);
      expect(piece.to).toBeLessThanOrEqual(1);
      expect(piece.to).toBeGreaterThan(piece.from);
    }
  });

  it('layers thicker garments outside thinner ones', () => {
    // The invariant the whole layering model rests on: an outer layer is
    // physically further from the skin than the mid layer under it.
    const thickest = (slot: string) =>
      Math.max(...GARMENTS.filter((g) => g.slots.includes(slot as never)).map((g) => g.offset));
    const thinnest = (slot: string) =>
      Math.min(...GARMENTS.filter((g) => g.slots.includes(slot as never)).map((g) => g.offset));
    expect(thickest('base')).toBeLessThan(thinnest('mid'));
    expect(thickest('mid')).toBeLessThanOrEqual(thinnest('outer'));
  });

  it('names only real garments in its presets', () => {
    for (const preset of PRESETS) {
      expect(preset.worn.length).toBeGreaterThan(0);
      for (const id of preset.worn) {
        expect(
          getGarment(id),
          `preset "${preset.id}" wears "${id}", which does not exist`,
        ).toBeDefined();
      }
    }
  });

  it('offers a swatch for everything it can dye', () => {
    expect(new Set(SWATCHES).size).toBe(SWATCHES.length);
  });
});

describe('dressing', () => {
  it('starts dressed', () => {
    const outfit = defaultOutfit();
    expect(outfit.worn.length).toBeGreaterThan(0);
    for (const w of outfit.worn) expect(getGarment(w.garment)).toBeDefined();
  });

  it('evicts whatever held the slot', () => {
    let outfit = wear(defaultOutfit(), 'jacket');
    expect(isWorn(outfit, 'jacket')).toBe(true);
    outfit = wear(outfit, 'coat');
    expect(isWorn(outfit, 'coat')).toBe(true);
    expect(isWorn(outfit, 'jacket')).toBe(false);
  });

  it('takes a garment off when it is already on — one control, both ways', () => {
    const dressed = wear(defaultOutfit(), 'scarf');
    expect(isWorn(dressed, 'scarf')).toBe(true);
    expect(isWorn(wear(dressed, 'scarf'), 'scarf')).toBe(false);
  });

  it('lets a two-slot garment evict both of the things it replaces', () => {
    const outfit = wear(defaultOutfit(), 'dress');
    expect(isWorn(outfit, 'dress')).toBe(true);
    expect(isWorn(outfit, 't-shirt')).toBe(false);
    expect(isWorn(outfit, 'jeans')).toBe(false);
    // …and the shoes, which claim neither slot, stay on.
    expect(isWorn(outfit, 'trainers')).toBe(true);
  });

  it('dyes only what is worn', () => {
    const outfit = dye(wear(defaultOutfit(), 'coat'), 'coat', 'moss');
    expect(outfit.worn.find((w) => w.garment === 'coat')?.swatch).toBe('moss');
    // Dyeing something that is not on is a no-op, not a way to wear it.
    const untouched = dye(defaultOutfit(), 'parka', 'rose');
    expect(isWorn(untouched, 'parka')).toBe(false);
  });

  it('orders the outfit by how far off the skin it sits', () => {
    let outfit = defaultOutfit();
    for (const id of ['coat', 'jumper', 'shirt']) outfit = wear(outfit, id);
    const order = layered(outfit).map((l) => l.garment.id);
    expect(order.indexOf('shirt')).toBeLessThan(order.indexOf('jumper'));
    expect(order.indexOf('jumper')).toBeLessThan(order.indexOf('coat'));
  });

  it('never leaves two garments fighting over one slot', () => {
    let outfit = defaultOutfit();
    for (const garment of GARMENTS) outfit = wear(outfit, garment.id);
    const seen = new Set<string>();
    for (const w of outfit.worn) {
      for (const slot of getGarment(w.garment)!.slots) {
        expect(seen.has(slot), `two garments claim "${slot}"`).toBe(false);
        seen.add(slot);
      }
    }
  });

  it('applies a preset over the current figure without changing it', () => {
    const tall = setFigure(defaultOutfit(), { height: 2.0 });
    const dressed = applyPreset(tall, 'formal');
    expect(dressed.figure.height).toBe(2.0);
    expect(isWorn(dressed, 'blazer')).toBe(true);
    expect(isWorn(dressed, 't-shirt')).toBe(false);
  });

  it('removes cleanly, and ignores garments it does not know', () => {
    expect(isWorn(remove(defaultOutfit(), 't-shirt'), 't-shirt')).toBe(false);
    expect(wear(defaultOutfit(), 'sou-wester')).toEqual(defaultOutfit());
  });

  it('clamps a figure nobody could stand up in', () => {
    expect(setFigure(defaultOutfit(), { height: 40 }).figure.height).toBeLessThan(2.1);
    expect(setFigure(defaultOutfit(), { build: -5 }).figure.build).toBe(0);
  });
});

describe('the figure', () => {
  it('builds every segment, and both of the paired ones', () => {
    const segments = buildFigure(DEFAULT_FIGURE);
    for (const id of PAIRED_SEGMENTS) {
      expect(
        segments
          .filter((s) => s.id === id)
          .map((s) => s.side)
          .sort(),
      ).toEqual(['left', 'right']);
    }
    expect(segments.filter((s) => s.id === 'torso')).toHaveLength(1);
  });

  it('mirrors the paired segments across the centreline', () => {
    const segments = buildFigure(DEFAULT_FIGURE);
    const left = segments.find((s) => s.id === 'thigh' && s.side === 'left')!;
    const right = segments.find((s) => s.id === 'thigh' && s.side === 'right')!;
    for (let i = 0; i < left.nodes.length; i++) {
      expect(left.nodes[i].p[0]).toBeCloseTo(-right.nodes[i].p[0], 12);
      expect(left.nodes[i].p[1]).toBeCloseTo(right.nodes[i].p[1], 12);
    }
  });
});
