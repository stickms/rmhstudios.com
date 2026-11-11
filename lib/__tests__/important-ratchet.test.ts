/**
 * `!important` in site-tier and app-tier CSS only goes down (redesign E4).
 *
 * The audit's target is <= 20 outside the games. What is left is nearly all of one of three kinds, each of which
 * needs the flag for a reason a layer or a selector cannot give:
 *
 *  - **print** (`loader-print-access.css`): the print sheet must beat inline styles, `style=` positions and every
 *    component rule, whatever their specificity;
 *  - **accessibility / degradation contracts** (`eversion.css`; the jelly sheets that carried most of
 *    them were deleted in Steel phase 1): "these outrank theme, material and utility layers" is the point, and WCAG 2.2.2 / 2.3.1 depend
 *    on it;
 *  - **beating an inline style** that script writes (`balatro` canvas size, `rmhcalculator` field-sizing fallback),
 *    a third-party stylesheet (`tf2-hud` CodeMirror) or a competing rule at higher specificity that a layer move
 *    cannot reorder (`page-motion` `animation: none` on the page root, the scrollbar reveal in `base-interaction`,
 *    the sticky reset in the radial shell).
 *
 * The map is per file and one-directional: a file may not gain one, and when a file loses one the number here must
 * come down in the same commit (so the list cannot quietly become permission). Counted outside comments.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { siteAppCssFiles } from './css-tiers';

const ROOT = process.cwd();

/** file -> number of `!important` declarations. */
const BASELINE: Record<string, number> = {
  'app/globals/base-interaction.css': 3,
  'app/globals/components-reveal.css': 1,
  'app/globals/loader-print-access.css': 21,
  'app/globals/page-motion.css': 3,
  'features/balatro/ui/balatro.css': 2,
  'components/radial/eversion/eversion.css': 4,
  'components/radial/radial/feed-cards-panels.css': 3,
  'components/rmhcalculator/rmhcalculator.css': 1,
  'components/tf2-hud/tf2-hud.css': 1,
};

function counts(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const f of siteAppCssFiles()) {
    const css = readFileSync(join(ROOT, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const n = (css.match(/!important/g) ?? []).length;
    if (n) out[f] = n;
  }
  return out;
}

describe('!important in site + app tier CSS (ratchet)', () => {
  const now = counts();

  it('no file gains one', () => {
    const up = Object.entries(now)
      .filter(([f, n]) => n > (BASELINE[f] ?? 0))
      .map(([f, n]) => `${f}: ${n} (baseline ${BASELINE[f] ?? 0})`);
    expect(
      up,
      'A new !important. Fix the cascade instead: put the rule where it wins on layer/specificity (an unlayered rule already beats Tailwind utilities). If it truly must beat an inline style or a print/a11y contract, raise the baseline here with the reason.',
    ).toEqual([]);
  });

  it('the baseline only falls: lower an entry when its file got cleaner', () => {
    const stale = Object.entries(BASELINE)
      .filter(([f, n]) => (now[f] ?? 0) < n)
      .map(([f, n]) => `${f}: now ${now[f] ?? 0}, baseline ${n}`);
    expect(stale).toEqual([]);
  });
});
