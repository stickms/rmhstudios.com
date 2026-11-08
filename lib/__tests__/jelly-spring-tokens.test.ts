/**
 * Spring-token parity (CSS-first jelly, PR 3; docs/superpowers/specs/2026-11-07-css-first-jelly-design.md §3).
 *
 * The CSS soft body's springs are authored ONCE, as `--spring-*` tokens in `app/jelly-material.css`, and every one of
 * them is the output of `dampedSpringLinear` (lib/jelly/spring-curves.ts) for a spring in `CSS_SPRINGS`
 * (lib/jelly/soft-policy.ts — the soft body's own `SPRINGS.jellyPress` / `jellyRelease`). The scale poses the CSS
 * moves between (`--jelly-hover-*`, `--jelly-press-*`) are `CSS_SOFT_BODY`, derived from `SOFT_BODY` and
 * `MOTION_BOUNDS`. A literal that drifts from its generator is a second, silent definition, so this gate parses the
 * sheet's `:root` and asserts each token equals its generator exactly, like `jelly-tokens.test.ts` does for globals.css.
 *
 * Retune a spring or a pose in TypeScript, then paste the regenerated literal; never loosen this test.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CSS_SOFT_BODY, CSS_SPRINGS } from '@/lib/jelly/soft-policy';
import { dampedSpringLinear, springSettleMs } from '@/lib/jelly/spring-curves';

const MATERIAL = readFileSync(join(process.cwd(), 'app', 'jelly-material.css'), 'utf8').replace(
  /\/\*[\s\S]*?\*\//g,
  '',
);

/** Every custom property declared in a `:root { … }` block of the sheet (nested blocks included). */
function rootTokens(css: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /(?:^|[\s}])(:root)\s*\{/g;
  for (let m = re.exec(css); m; m = re.exec(css)) {
    let depth = 1;
    let i = m.index + m[0].length;
    const start = i;
    for (; i < css.length && depth > 0; i++) {
      if (css[i] === '{') depth++;
      else if (css[i] === '}') depth--;
    }
    for (const d of css.slice(start, i - 1).matchAll(/(--[\w-]+)\s*:\s*([^;{}]+);/g))
      // Prettier may wrap a long curve one stop per line: compare it as one line.
      out[d[1]] = d[2].replace(/\s+/g, ' ').replace(/\(\s+/g, '(').replace(/\s+\)/g, ')').trim();
  }
  return out;
}

const TOKENS = rootTokens(MATERIAL);
const num = (n: number) => `${+n.toFixed(4)}`;

/** Token → the exact literal its generator produces. */
const EXPECTED: Record<string, string> = {
  ...Object.fromEntries(
    Object.entries(CSS_SPRINGS).flatMap(([name, s]) => [
      [`--spring-${name}`, dampedSpringLinear(s)],
      [`--spring-${name}-dur`, `${springSettleMs(s)}ms`],
    ]),
  ),
  '--jelly-hover-plump': num(CSS_SOFT_BODY.hoverPlump),
  '--jelly-hover-dent': num(CSS_SOFT_BODY.hoverDent),
  '--jelly-press-control': num(CSS_SOFT_BODY.pressControl),
  '--jelly-press-card': num(CSS_SOFT_BODY.pressCard),
};

describe('CSS spring tokens are generated, not hand-written', () => {
  it.each(Object.entries(EXPECTED))('%s equals its generator', (token, value) => {
    expect(TOKENS[token], `${token} is missing from a :root block in app/jelly-material.css`).toBe(
      value,
    );
  });

  it('declares no --spring-* token without a generator', () => {
    const orphans = Object.keys(TOKENS).filter(
      (t) => t.startsWith('--spring-') && !(t in EXPECTED),
    );
    expect(
      orphans,
      'every --spring-* literal comes from CSS_SPRINGS in lib/jelly/soft-policy.ts',
    ).toEqual([]);
  });

  it('every spring curve is a linear() easing from 0 to 1', () => {
    for (const name of Object.keys(CSS_SPRINGS)) {
      expect(TOKENS[`--spring-${name}`]).toMatch(/^linear\(0, .*, 1\)$/);
    }
  });
});
