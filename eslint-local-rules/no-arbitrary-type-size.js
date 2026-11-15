/**
 * `local/no-arbitrary-type-size` — type sizes and layers are named, not typed in
 * (E2, docs/plans/2026-11-09-ground-up-redesign-audit.md).
 *
 * `text-[10px]` and `z-[100]` are how a scale gets lost: the author reached for the
 * number because the scale had no step, and the next author copied the number. The
 * site's steps are the `--text-*` entries in the E2 `@theme` block and the `z-*`
 * layers beside them (app/globals.css), backed by the `--z-*` stacking scale (§5.6).
 * Use `text-micro`, `text-caption`, `z-popover` …, or ADD a step there (and to
 * `TYPE_SCALE_STEPS` / `Z_LAYER_NAMES` in lib/utils.ts, so tailwind-merge dedupes it) and
 * prove it with `node scripts/probe-type-scale.mjs`.
 *
 * Flags a plain length (`text-[Npx]`, `text-[N.Nrem]`, `text-[Nem]`) and a plain integer layer
 * (`z-[N]`) under any variant. `text-[color:…]`, `text-[clamp(…)]` and `z-[var(…)]` are other
 * questions and are not matched. No autofix: which step a size belongs to is the author's call.
 *
 * Scope: the site tier only (design-scope.js) — games and the `--app-*` apps own their type.
 */
import { createPatternRule } from './class-strings.js';

export default createPatternRule(
  {
    description:
      'Use a named type step / z layer instead of an arbitrary `text-[Npx]` / `z-[N]` (E2)',
    message:
      '`{{match}}` is an arbitrary value. Use a named step: text-pico/nano/tiny/micro/caption/body (px), text-rem-NN (rem), or a z layer (z-content/topbar/hub-overlay/palette/popover/call/call-dialog) from app/globals.css "E2 type scale"; or add one there and prove it with scripts/probe-type-scale.mjs.',
    pattern:
      /(?<![\w-])(?:text-\[\d*\.?\d+(?:px|rem|em)\]|z-\[\d+\])(?![\w-])/g,
  },
);
