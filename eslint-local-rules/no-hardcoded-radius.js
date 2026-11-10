/**
 * `local/no-hardcoded-radius` — site-tier UI uses the themed radius scale
 * (docs/design-language.md §13 rule 6).
 *
 * `rounded-lg` is a fixed 8px that ignores each theme's --site-radius. Use
 * `rounded-site` / `rounded-site-sm`. `rounded-full` and `rounded-none` are
 * shapes, not radii, and stay fine.
 *
 * Scope: same site tier as `no-raw-palette-color` (login.tsx is NOT exempt here).
 */
import { createPatternRule } from './class-strings.js';

export default createPatternRule({
  description:
    'Use rounded-site / rounded-site-sm, not a fixed Tailwind radius (design-language §13 rule 6)',
  message:
    'Hardcoded radius `{{match}}`: use rounded-site / rounded-site-sm so every theme controls the corner. rounded-full and rounded-none are fine.',
  pattern: /(?<![\w:-])rounded-(?:sm|md|lg|xl|2xl|3xl)(?![\w-])/g,
});
