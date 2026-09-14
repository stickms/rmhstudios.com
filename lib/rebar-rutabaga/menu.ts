/**
 * Rebar & Rutabaga — the tasting menu, and where each course sits on the globe.
 *
 * ## Why this menu is a sphere
 *
 * The kitchen's technique is **spherification**: a liquid is bound with a
 * hydrocolloid and set into a skin, so it arrives as a ball that holds its shape
 * until it is bitten and then is liquid again. Nine of the nine courses are one
 * or another form of it.
 *
 * So the menu is not *displayed on* the site's liquid globe as a borrowed
 * idiom — it is the same object as the food. Every course is a pearl on the
 * sphere; bringing one to the reticle is picking it up; and the wave that runs
 * across the glass when you press it is the one thing a set sphere does when you
 * touch it. The sphere itself is `lib/globe.ts` and the wave is `lib/fluid.ts`;
 * this file is only the reading, in the same way `lib/kaikai-debt/globe.ts` is
 * the ledger's reading of the same instrument.
 *
 * ## The map
 *
 * - **Position is the running order.** Courses are placed by the golden-angle
 *   spiral (`spiralAnchor`), so the nine sit evenly over the usable band instead
 *   of bunching, and course 01 is in the same place on every visit.
 * - **Radius is the sphere's real diameter**, in millimetres, scaled to the
 *   globe. A 2 mm alginate pearl draws small and the 38 mm rutabaga ravioli
 *   draws large, so the pearl you see is the pearl that arrives.
 *
 * ## Facts here, words elsewhere
 *
 * This file carries only what is TRUE about a course — its running order, the
 * diameter it is served at, its temperature, which bath set it. Every word said
 * about it lives in `components/rebar-rutabaga/copy.ts`, keyed by `Course.id`,
 * because `i18next-parser` extracts by reading source and cannot see through a
 * computed key: strings kept here and interpolated into `t()` would never reach
 * `locales/` and every locale would silently serve English (root `CLAUDE.md`
 * §5). The id is the join, and nothing is said twice.
 */

import { spiralAnchor, type GlobeAnchor } from '@/lib/globe';

/** The hydrocolloid technique a course is built with. */
export type Technique =
  | 'direct'
  | 'reverse'
  | 'frozen-reverse'
  | 'fluid-gel'
  | 'espuma'
  | 'aerogel';

export interface Course {
  /** Stable key fragment — the i18n key stem in `copy.ts`. Never rename these. */
  id: string;
  /** 1-based running order. */
  no: number;
  technique: Technique;
  /** Finished sphere diameter in millimetres — drives the drawn pearl's size. */
  diameterMm: number;
  /** Serve temperature in °C. Fine-dining menus carry this; so does this one. */
  tempC: number;
  /** The one on the sign. Exactly one course may carry this. */
  signature?: true;
}

/**
 * Sphere diameters, in millimetres, that the globe's pearls are drawn to scale
 * from. The smallest real pearl on the menu is 2 mm and the largest is 38 mm;
 * drawing that range linearly would make course 01 a sub-pixel dot, so the
 * renderer takes the square root of the ratio (area, not diameter, is what the
 * eye compares) — see `pearlRadius`.
 */
export const MIN_PEARL_MM = 2;
export const MAX_PEARL_MM = 38;

export const COURSES: readonly Course[] = [
  { id: 'birch-caviar', no: 1, technique: 'direct', diameterMm: 2, tempC: 4 },
  { id: 'rye-espuma', no: 2, technique: 'espuma', diameterMm: 26, tempC: 52 },
  { id: 'oyster-reverse', no: 3, technique: 'reverse', diameterMm: 22, tempC: 10 },
  { id: 'rutabaga-400', no: 4, technique: 'reverse', diameterMm: 38, tempC: 62, signature: true },
  { id: 'cod-nitro', no: 5, technique: 'frozen-reverse', diameterMm: 30, tempC: 48 },
  { id: 'marrow-pearls', no: 6, technique: 'fluid-gel', diameterMm: 6, tempC: 66 },
  { id: 'reindeer-smoke', no: 7, technique: 'reverse', diameterMm: 34, tempC: 56 },
  { id: 'cloudberry-frozen', no: 8, technique: 'frozen-reverse', diameterMm: 28, tempC: 2 },
  { id: 'gravel', no: 9, technique: 'aerogel', diameterMm: 8, tempC: 18 },
];

/** Where each course sits on the sphere, in running order. Computed once. */
export const COURSE_ANCHORS: readonly GlobeAnchor[] = COURSES.map((_, i) =>
  spiralAnchor(i, COURSES.length),
);

/**
 * The drawn radius of a course's pearl, as a fraction of the globe's radius.
 *
 * Scaled by the square root of the diameter ratio rather than the ratio itself:
 * the eye compares the *area* of two discs, so a linear map makes the 2 mm
 * caviar a sub-pixel speck next to the 38 mm ravioli and the menu loses a
 * course. The floor keeps the smallest pearl a legible target — a hit area is
 * not the mark, but the mark still has to be findable.
 */
export function pearlRadius(diameterMm: number): number {
  const t = Math.sqrt(
    Math.max(0, diameterMm - MIN_PEARL_MM) / Math.max(1, MAX_PEARL_MM - MIN_PEARL_MM),
  );
  return 0.035 + t * 0.055;
}

/** The house price, in SEK, per guest. Pairings are priced separately. */
export const MENU_PRICE_SEK = 1450;
export const WINE_PAIRING_SEK = 950;
export const JUICE_PAIRING_SEK = 650;
