/**
 * `local/no-raw-palette-color` — site-tier UI names no raw Tailwind palette colour
 * (docs/design-language.md §13 rule 5).
 *
 * A raw palette colour is the same pixel in every theme, which is the one thing
 * the --site-* token contract exists to prevent. Use a token utility
 * (`bg-site-surface`, `text-site-danger`, …). If the colour is genuinely
 * domain-fixed (a playing card, a brand mark), add a scoped variable group like
 * `--casino-*` and bind it in `@theme inline` (design-language.md §1).
 *
 * Scope (eslint.config.mjs, from `design-scope.js`): `components/**` and
 * `app/routes/**` `.tsx`, minus the full-screen game/app tier and `login.tsx`.
 */
import { createPatternRule } from './class-strings.js';

export default createPatternRule({
  description: 'Use --site-* token utilities, not raw palette colours (design-language §13 rule 5)',
  message:
    'Raw palette colour `{{match}}`: use a --site-* token utility (bg-site-surface, text-site-danger, …) or a scoped variable group. See docs/design-language.md §1.',
  pattern:
    /(?<![\w:-])(?:bg|text|border|ring|from|via|to|fill|stroke|divide|outline|shadow|decoration|placeholder|caret|accent)-(?:zinc|gray|slate|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}(?![\w-])/g,
});
