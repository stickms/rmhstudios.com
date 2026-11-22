/**
 * `local/no-hardcoded-radius` — site-tier UI uses the Steel radius scale
 * (docs/plans/2026-11-11-steel-design-implementation.md §2; docs/design-language.md §13 rule 6).
 *
 * Steel has two radii, `--site-radius` (8px: controls, pictures) and `--site-radius-sm` (4px: tags, small chips), as
 * `rounded-site` / `rounded-site-sm`. `rounded-lg` and friends are fixed sizes that ignore them, and an arbitrary value
 * with a literal length (`rounded-[3px]`, `rounded-[44%_56%…]`) is a third radius. Flagged: `rounded-sm|md|lg|xl|2xl|3xl`
 * (and the side variants) and any arbitrary `rounded-[…]` that does not read a token (`var(--…)`) or `inherit`.
 * `rounded-full` and `rounded-none` are shapes, not radii, and stay fine.
 *
 * Scope: same site tier as `no-raw-palette-color` (login.tsx is NOT exempt here), minus the named, shrinking
 * `STEEL_PALETTE_BASELINE`.
 */
import { createPatternRule } from './class-strings.js';

export const PATTERN =
  /(?<![\w:-])rounded(?:-(?:[tblrse]|tl|tr|bl|br|ss|se|es|ee))?-(?:(?:sm|md|lg|xl|2xl|3xl)(?![\w-])|\[(?![^\]]*(?:var\(|inherit))[^\]]*\])/g;

export default createPatternRule({
  description:
    'Use rounded-site / rounded-site-sm, not a fixed Tailwind radius or a literal arbitrary radius (Steel §2)',
  message:
    'Hardcoded radius `{{match}}`: Steel has two radii. Use rounded-site (8px) / rounded-site-sm (4px), or `rounded-[var(--token)]`. rounded-full and rounded-none are fine.',
  pattern: PATTERN,
});
