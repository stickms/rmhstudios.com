/**
 * `local/no-dead-animate-classes` — no `tailwindcss-animate` classes
 * (docs/design-language.md §13 rule 9).
 *
 * That was a Tailwind v3 plugin; the v4 migration dropped it, so `animate-in`,
 * `fade-in-0`, `zoom-in-95`, `slide-in-from-*`, `fill-mode-*` compile to ZERO
 * rules. They read as intent, so nobody adds the real thing. Use
 * `lib/motion.ts` (`scaleIn`, `popIn`, `overlay`, `modalContent`) or the CSS
 * enters that exist (`.page-enter`, `radial-page-rise`, `.feed-item-enter`).
 *
 * Scope: the whole `components/**` + `app/routes/**` tree — a class that
 * produces no CSS is dead everywhere.
 */
import { createPatternRule } from './class-strings.js';

export default createPatternRule({
  description:
    'No tailwindcss-animate classes: the plugin is not installed (design-language §13 rule 9)',
  message:
    '`{{match}}` compiles to no CSS (tailwindcss-animate is not installed). Use lib/motion.ts variants (scaleIn / popIn / modalContent) or an existing CSS enter.',
  pattern:
    /(?<![\w:./-])(?:[\w-]+(?:\[[^\]]*\])?:)*(?:animate-(?:in|out)|fade-(?:in|out)|zoom-(?:in|out)|slide-(?:in-from|out-to)-(?:top|bottom|left|right)|fill-mode-(?:both|forwards|backwards|none))(?:-(?:\d+(?:\/\d+)?|\[[^\]]*\]))?(?![\w./-])/g,
});
