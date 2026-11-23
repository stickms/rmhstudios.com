import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * A text field with no box of its own, sitting inside a box that IS the field (the RMH Vibe prompt dock, a search pill
 * with an icon), must not draw the K10 ring round itself: that ring hugs the bare textarea and reads as a second box
 * inside the first (owner, 2026-11-19: "weird ass outline on the text entry (inside the existing outline)").
 *
 * The bug is always written the same way: the author puts `outline: 0` / `outline: none` on the field's base class and
 * believes the ring is gone. It is not: the global K10 rule in app/globals/base-interaction.css
 * (`textarea:focus-visible`, `input:focus-visible`, unlayered) out-specifies a single class and draws the ring anyway,
 * so the declaration is dead and the double box ships.
 *
 * The working pattern, and the only one new code may use:
 *   1. mark the bare field in markup with `field-bare` (or a Tailwind `outline-none` utility), which
 *      base-interaction.css honours, and
 *   2. if a container is the field, give the CONTAINER the ring:
 *      `.box:has(.box__field:focus-visible) { outline: 2px solid var(--site-text); outline-offset: -1px; }`
 *      (see `.vibe-dock` in components/rmhvibe/vibe.css).
 *
 * So `outline: 0|none` on a selector that is not itself a `:focus*` / `:has()` state is counted per file and the
 * counts only fall. Fixing one of these: delete the declaration, apply the pattern above, lower the number here.
 */

const root = new URL('../../', import.meta.url).pathname;

const BASELINE: Record<string, number> = {
  'components/dunesday/os/apps/paint.css': 3,
  'components/dunesday/os/apps/utilities.css': 1,
  'components/dunesday/os/os.css': 12,
  'components/elections/elections.css': 2,
  'components/kowloon-knockout/kk-menu.css': 1,
  'components/library/album-viewer.css': 1,
  'components/library/library/catalog-reader.css': 4,
  'components/rmhcalculator/rmhcalculator.css': 3,
  'components/shell/site-shell.css': 1,
  'components/steam/steam.css': 1,
  'components/tf2-game/tf2-game.css': 1,
  'components/tf2-hud/tf2-hud.css': 1,
  'features/balatro/ui/balatro.css': 1,
  'features/synapse-storm/ui/SynapseStorm.css': 1,
};

function deadOutlineRules(): Map<string, string[]> {
  const files = execFileSync('git', ['ls-files', 'app/**/*.css', 'components/**/*.css', 'features/**/*.css'], {
    cwd: root,
    encoding: 'utf8',
  })
    .split('\n')
    .filter(Boolean);
  const found = new Map<string, string[]>();
  for (const file of files) {
    const css = readFileSync(`${root}${file}`, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const selector = (m[1] ?? '').trim().replace(/\s+/g, ' ');
      const body = m[2] ?? '';
      if (!/(^|[;\s])outline\s*:\s*(0|none)\s*(;|!|$)/.test(body)) continue;
      if (/:focus|:has\(/.test(selector)) continue;
      found.set(file, [...(found.get(file) ?? []), selector]);
    }
  }
  return found;
}

describe('bare text fields: the ring goes on the box, not round the words', () => {
  const found = deadOutlineRules();

  it('adds no new base-selector `outline: 0|none` (use `field-bare` + a container `:has()` ring)', () => {
    const over: string[] = [];
    for (const [file, selectors] of found) {
      const allowed = BASELINE[file] ?? 0;
      if (selectors.length > allowed)
        over.push(`${file}: ${selectors.length} > ${allowed}\n    ${selectors.join('\n    ')}`);
    }
    expect(over, over.join('\n')).toEqual([]);
  });

  it('the baseline only falls (lower a number when you fix one)', () => {
    const stale = Object.entries(BASELINE)
      .filter(([file, n]) => (found.get(file)?.length ?? 0) < n)
      .map(([file, n]) => `${file}: baseline ${n}, now ${found.get(file)?.length ?? 0}`);
    expect(stale, stale.join('\n')).toEqual([]);
  });

  it('the global K10 rule still honours `field-bare`', () => {
    const css = readFileSync(`${root}app/globals/base-interaction.css`, 'utf8');
    expect(css).toMatch(/:is\(input, textarea\):is\(\.field-bare[^)]*\)[^{]*:focus-visible\s*\{\s*outline: none;/);
  });
});
