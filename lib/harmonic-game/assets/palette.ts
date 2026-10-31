/**
 * The game's colour palette (sRGB, 0..255): cold whites, steel greys, rust, 1971 enamel
 * paints, ice blue, and one amber accent. Pure data.
 */
export type Rgb = readonly [number, number, number];

export const PALETTE = {
  // cold whites
  snowWhite: [232, 238, 244],
  snowShade: [176, 192, 212],
  frostWhite: [214, 226, 238],
  // steel greys
  steelDark: [58, 64, 72],
  steelMid: [102, 110, 120],
  steelLight: [152, 160, 170],
  steelSeam: [28, 31, 36],
  concreteLight: [158, 158, 154],
  concreteDark: [96, 97, 96],
  grateVoid: [18, 20, 24],
  // rust
  rustDark: [86, 44, 26],
  rustMid: [142, 74, 38],
  rustLight: [176, 104, 52],
  // 1971 enamel paints
  enamelWhite: [226, 222, 208],
  enamelAged: [196, 184, 148],
  enamelGrime: [92, 82, 62],
  // ice
  iceBlue: [150, 196, 224],
  iceDeep: [38, 98, 150],
  iceWhite: [214, 236, 248],
  // glass
  glassTint: [168, 206, 210],
  // wood
  deckLight: [150, 112, 72],
  deckDark: [92, 64, 40],
  // hazard + the one accent
  hazardBlack: [26, 26, 28],
  amber: [236, 160, 36],
} as const satisfies Record<string, Rgb>;

export type PaletteName = keyof typeof PALETTE;

export const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);

/** Linear blend of two colours. */
export function mixRgb(a: Rgb, b: Rgb, t: number): [number, number, number] {
  const k = clamp01(t);
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
}

/** Scales brightness (1 = unchanged). */
export function shade(c: Rgb, k: number): [number, number, number] {
  return [c[0] * k, c[1] * k, c[2] * k];
}
