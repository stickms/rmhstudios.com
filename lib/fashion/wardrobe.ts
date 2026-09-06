/**
 * **The outfit** — what is on the figure, in what colour, and the rules about
 * what can be on it at once.
 *
 * Pure state, no rendering. A dressing room's one real rule is that a place on
 * the body holds one thing: putting a coat on takes the jacket off, because they
 * both want the `outer` slot. Everything else here follows from that.
 */

import { CATEGORY_ORDER, GARMENTS, getGarment, type Garment, type Slot } from './garments';
import { DEFAULT_FIGURE, normaliseFigure, type FigureSpec } from './figure';
import type { SwatchId } from './palette';

export { FIGURE_TONES, SWATCHES, isSwatch, swatchVar, type SwatchId } from './palette';

/** One worn item: which garment, and what colour it was dyed. */
export interface WornItem {
  garment: string;
  swatch: SwatchId;
}

export interface Outfit {
  figure: FigureSpec;
  /** The figure's own tone. */
  tone: SwatchId;
  /** Worn items, in no particular order — {@link layered} sorts them. */
  worn: WornItem[];
}

/** What a first-time visitor finds on the stage. */
export function defaultOutfit(): Outfit {
  return {
    figure: { ...DEFAULT_FIGURE },
    tone: 'slate',
    worn: [
      { garment: 't-shirt', swatch: 'bone' },
      { garment: 'jeans', swatch: 'indigo' },
      { garment: 'trainers', swatch: 'bone' },
    ],
  };
}

/** Every slot a garment occupies, or `[]` if the id is unknown. */
function slotsOf(id: string): Slot[] {
  return getGarment(id)?.slots ?? [];
}

/** Is this garment currently on the figure? */
export function isWorn(outfit: Outfit, id: string): boolean {
  return outfit.worn.some((w) => w.garment === id);
}

/**
 * Put a garment on, taking off whatever held any slot it needs.
 *
 * Wearing something already worn takes it off instead — one control, both
 * directions, which is what a tap on a thumbnail should do.
 */
export function wear(outfit: Outfit, id: string): Outfit {
  const garment = getGarment(id);
  if (!garment) return outfit;
  if (isWorn(outfit, id)) return remove(outfit, id);

  const claimed = new Set<Slot>(garment.slots);
  const kept = outfit.worn.filter((w) => !slotsOf(w.garment).some((s) => claimed.has(s)));
  return { ...outfit, worn: [...kept, { garment: id, swatch: garment.swatch }] };
}

export function remove(outfit: Outfit, id: string): Outfit {
  return { ...outfit, worn: outfit.worn.filter((w) => w.garment !== id) };
}

/** Re-dye one worn garment. A garment that is not on cannot be dyed. */
export function dye(outfit: Outfit, id: string, swatch: SwatchId): Outfit {
  return {
    ...outfit,
    worn: outfit.worn.map((w) => (w.garment === id ? { ...w, swatch } : w)),
  };
}

export function setFigure(outfit: Outfit, figure: Partial<FigureSpec>): Outfit {
  return { ...outfit, figure: normaliseFigure({ ...outfit.figure, ...figure }) };
}

export function setTone(outfit: Outfit, tone: SwatchId): Outfit {
  return { ...outfit, tone };
}

/**
 * The outfit in layer order — innermost first.
 *
 * Sorted by the garments' own thickness, so the order is a physical fact rather
 * than a list somebody has to keep in sync: a 12 mm shirt is inside a 26 mm
 * jumper is inside a 46 mm coat, and nothing can be drawn over a layer it is
 * actually underneath.
 */
export function layered(outfit: Outfit): { item: WornItem; garment: Garment }[] {
  return outfit.worn
    .flatMap((item) => {
      const garment = getGarment(item.garment);
      return garment ? [{ item, garment }] : [];
    })
    .sort((a, b) => a.garment.offset - b.garment.offset);
}

/** The catalogue grouped for the wardrobe rail, head down to feet. */
export function byCategory(): { category: (typeof CATEGORY_ORDER)[number]; garments: Garment[] }[] {
  return CATEGORY_ORDER.map((category) => ({
    category,
    garments: GARMENTS.filter((g) => g.category === category),
  })).filter((group) => group.garments.length > 0);
}

/** A few complete looks, so the stage is never a naked figure and a blank rail. */
export const PRESETS: { id: string; worn: string[] }[] = [
  { id: 'everyday', worn: ['t-shirt', 'jeans', 'trainers'] },
  { id: 'layered', worn: ['long-sleeve-tee', 'jumper', 'jacket', 'trousers', 'boots', 'beanie'] },
  { id: 'formal', worn: ['shirt', 'blazer', 'trousers', 'dress-shoes', 'watch'] },
  { id: 'summer', worn: ['tank-top', 'shorts', 'sandals', 'sunglasses', 'bucket-hat'] },
  {
    id: 'winter',
    worn: ['long-sleeve-tee', 'jumper', 'parka', 'jeans', 'boots', 'scarf', 'beanie', 'gloves'],
  },
];

/** Apply a preset on top of the current figure, replacing whatever is worn. */
export function applyPreset(outfit: Outfit, id: string): Outfit {
  const preset = PRESETS.find((p) => p.id === id);
  if (!preset) return outfit;
  let next: Outfit = { ...outfit, worn: [] };
  for (const garment of preset.worn) next = wear(next, garment);
  return next;
}
