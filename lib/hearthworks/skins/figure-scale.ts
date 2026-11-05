/**
 * The size contract every drawn person obeys, whatever draws them (the procedural stand-in or a skinned model):
 * a person is about 0.4 tile tall and a door 0.44 (a tile is ~4 m), smaller than a cottage wall, taller than a crop.
 */

/** World units per figure unit: the procedural figure is authored ~1.26 units tall. */
export const FIGURE_SCALE = 0.3;

/** Height of the procedural figure in its own units (top of the head, without a hat). */
export const FIGURE_UNITS_HEIGHT = 1.26;

/** How tall a person standing in the world is, in world units, for a skin whose look has this height multiplier. */
export function figureWorldHeight(lookHeight: number): number {
  const h = Number.isFinite(lookHeight) && lookHeight > 0 ? lookHeight : 1;
  return FIGURE_UNITS_HEIGHT * FIGURE_SCALE * h;
}

/**
 * Uniform scale that makes a model `modelHeight` metres tall stand as tall as the procedural figure it replaces.
 * A bad height (0, NaN, negative) is treated as 1.8 m so a broken manifest entry still draws a person-sized person.
 */
export function modelScale(modelHeight: number, lookHeight: number): number {
  const m = Number.isFinite(modelHeight) && modelHeight > 0 ? modelHeight : 1.8;
  return figureWorldHeight(lookHeight) / m;
}
