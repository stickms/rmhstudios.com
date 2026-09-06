/**
 * The wardrobe's colours, as ids rather than values.
 *
 * A garment's colour is domain-fixed the way a playing card's is: a red coat is
 * red in every theme, and re-tinting it when somebody switches to Midnight would
 * be re-dyeing their clothes because they changed the lights. So the values live
 * in a scoped variable group — `--rmhfash-swatch-*` in
 * `components/rmhfashion/fashion.css` — which is the pattern
 * `docs/design-language.md` §13 rule 5 prescribes for exactly this case, and
 * nothing in TypeScript ever names a colour.
 *
 * `accent` is the one that is NOT domain-fixed: it resolves to `--site-accent`,
 * so a visitor can dress the figure in the site's own colour and have it follow
 * their theme and accent preset.
 */

export const SWATCHES = [
  'ink',
  'bone',
  'slate',
  'sand',
  'clay',
  'moss',
  'sky',
  'indigo',
  'plum',
  'rose',
  'ochre',
  'accent',
] as const;

export type SwatchId = (typeof SWATCHES)[number];

/** Tones the figure itself can be drawn in. A subset, so nobody is neon. */
export const FIGURE_TONES: readonly SwatchId[] = ['bone', 'sand', 'clay', 'ochre', 'slate', 'ink'];

export function isSwatch(value: string): value is SwatchId {
  return (SWATCHES as readonly string[]).includes(value);
}

/** The CSS custom property a swatch reads from. */
export function swatchVar(id: SwatchId): string {
  return `--rmhfash-swatch-${id}`;
}
