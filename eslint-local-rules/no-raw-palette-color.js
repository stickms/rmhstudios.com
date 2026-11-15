/**
 * `local/no-raw-palette-color` — site-tier UI names only the colours of Steel section 2
 * (docs/plans/2026-11-11-steel-design-implementation.md §2, §17; docs/design-language.md §13 rule 5).
 *
 * A raw colour is the same pixel in both editions, which is the one thing the `--site-*` token contract exists to
 * prevent. Use a token utility (`bg-site-bg`, `bg-site-surface`, `text-site-text-muted`, `border-site-border`,
 * `text-site-danger`, …). Flagged: every Tailwind palette family and step (`bg-red-500`), `white` and `black`
 * (`bg-black/60`, `text-white`), and any colour literal in an arbitrary value (`bg-[#fff]`, `text-[rgb(0,0,0)]`,
 * `border-[color-mix(…)]`). If a colour is genuinely domain-fixed (a playing card, a brand mark, a scrim over a photo)
 * add a scoped variable group like `--casino-*` or `--site-media-*` and bind it in `@theme inline`.
 *
 * Scope (eslint.config.mjs, from `design-scope.js`): `components/**` and `app/routes/**` `.tsx`, minus the full-screen
 * game/app tier, `login.tsx` and the named, shrinking `STEEL_PALETTE_BASELINE` (each entry says which phase removes it).
 */
import { createPatternRule } from './class-strings.js';

const PREFIX =
  '(?:bg|text|border|ring|from|via|to|fill|stroke|divide|outline|shadow|decoration|placeholder|caret|accent)';
const FAMILY =
  '(?:zinc|gray|slate|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\\d{2,3}';
const LITERAL =
  '\\[(?:#|rgba?\\(|hsla?\\(|oklch\\(|oklab\\(|lab\\(|lch\\(|color-mix\\()';

export const PATTERN =
  new RegExp(
    `(?<![\\w:-])${PREFIX}-(?:${FAMILY}|white|black|${LITERAL})(?![\\w-])`,
    'g',
  );

export default createPatternRule(
  {
    description:
      'Use the Steel section-2 token utilities (bg-site-*, text-site-*, border-site-*), not raw colours (design-language §13 rule 5)',
    message:
      'Raw colour `{{match}}`: use a --site-* token utility (bg-site-surface, text-site-muted, border-site-border, text-site-danger, …) or a scoped variable group. See docs/plans/2026-11-11-steel-design-implementation.md §2.',
    pattern:
      PATTERN,
  },
);
