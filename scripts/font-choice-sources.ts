/**
 * Where each face of the reader's font catalogue (lib/appearance/fonts.ts) comes from: its Fontsource package and the
 * stylesheets inside it. Read by scripts/gen-self-hosted-fonts.ts (one `app/fonts/choice/<id>.css` per face) and
 * scripts/gen-font-metrics.ts `--choice` (the metric-matched fallbacks).
 *
 * Weights: the site uses 400/500/600 (Steel Y1). A variable face covers them with its `wght` axis; a static face ships
 * the files it has, and `weights` widens a descriptor where a file must also answer a weight it lacks (Charis SIL has
 * no 600, so its 700 answers 600 too).
 */
import type { FontId } from '../lib/appearance/fonts';

export interface ChoiceSource {
  pkg: string;
  css: string[];
  /** Fontsource weight → the `font-weight` descriptor to write instead. */
  weights?: Record<string, string>;
}

const variable = (name: string): ChoiceSource => ({
  pkg: `@fontsource-variable/${name}`,
  css: ['wght.css', 'wght-italic.css'],
});

export const CHOICE_SOURCES: Record<FontId, ChoiceSource> = {
  // The default rides the site sheet (and the game islands built from it), so it carries the upright axis only, as
  // Geist did; italics are synthesized. A face a reader chooses is its own sheet and brings its italics.
  'dm-sans': { pkg: '@fontsource-variable/dm-sans', css: ['wght.css'] },
  inter: variable('inter'),
  geist: variable('geist'),
  'ibm-plex-sans': variable('ibm-plex-sans'),
  'public-sans': variable('public-sans'),
  charter: {
    pkg: '@fontsource/charis-sil',
    css: ['400.css', '700.css', '400-italic.css', '700-italic.css'],
    weights: { '700': '600 700' },
  },
  'source-serif-4': variable('source-serif-4'),
  literata: variable('literata'),
  newsreader: variable('newsreader'),
  lora: variable('lora'),
  merriweather: variable('merriweather'),
  spectral: { pkg: '@fontsource/spectral', css: ['400.css', '500.css', '600.css', '400-italic.css'] },
  // Mono text is set at 400 (t-meta); a second static weight doubled the site sheet's mono rules for nothing.
  'dm-mono': { pkg: '@fontsource/dm-mono', css: ['400.css'] },
  'jetbrains-mono': { pkg: '@fontsource-variable/jetbrains-mono', css: ['wght.css'] },
  'geist-mono': { pkg: '@fontsource-variable/geist-mono', css: ['wght.css'] },
  'ibm-plex-mono': { pkg: '@fontsource/ibm-plex-mono', css: ['400.css'] },
};
