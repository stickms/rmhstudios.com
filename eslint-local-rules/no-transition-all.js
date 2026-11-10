/**
 * `local/no-transition-all` — nothing uses `transition-all`
 * (docs/design-language.md §13 rule 8).
 *
 * `all` makes the engine watch EVERY animatable property including
 * width/height/top/margin, so a class change that happens to touch layout
 * animates a reflow. Name the properties: `transition-colors`,
 * `transition-transform`, `transition-opacity`, a `transition-[a,b]` list, or
 * plain `transition`. A progress bar is `scaleX` on a full-width fill, not an
 * animated `width`. No autofix: which property moves is the author's call.
 *
 * Scope: the whole `components/**` + `app/routes/**` tree, games included — it
 * is a rendering cost, not a palette question.
 */
import { createPatternRule } from './class-strings.js';

export default createPatternRule({
  description:
    'Name the transitioned properties instead of `transition-all` (design-language §13 rule 8)',
  message:
    '`transition-all` animates layout properties too. Name what moves: transition-colors / transition-transform / transition-opacity / transition-[a,b].',
  pattern: /(?<![\w-])transition-all(?![\w-])/g,
});
