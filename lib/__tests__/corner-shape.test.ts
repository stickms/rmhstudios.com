import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { readCss } from './css-source';

/**
 * Corner shape (see the "Corner shape" note in app/globals/base-interaction.css `@layer base`). Steel removed the
 * squircle default from the site tier (its corners are plain 8px and 4px arcs); the games and full-screen apps keep
 * theirs (L8), so the rule is scoped to `html.app-route` and every rounded corner there is a squircle where
 * `corner-shape` is supported, and circles and pills stay circular. A circle is any `border-radius` that is 50% /
 * 100%, 99px or more, `calc(infinity …)`, or one of the pill tokens. Without `corner-shape: round` beside it, an
 * avatar silently becomes a rounded square.
 */

const root = new URL('../../', import.meta.url).pathname;
const cssFiles = execFileSync('git', ['ls-files', '*.css'], { cwd: root, encoding: 'utf8' })
  .split('\n')
  .filter((f) => f.startsWith('app/') || f.startsWith('components/'));

const isCircle = (value: string): boolean => {
  if (/(^|[\s(])(50|100)%/.test(value)) return true;
  if (value.includes('calc(infinity')) return true;
  if (/var\(--(stk-r-pill|toj-radius-pill)\)/.test(value)) return true;
  return [...value.matchAll(/(\d+(?:\.\d+)?)px/g)].some((m) => Number(m[1]) >= 99);
};

function missingNextTo(pattern: RegExp, want: RegExp, accept: (value: string) => boolean): string[] {
  const missing: string[] = [];
  for (const file of cssFiles) {
    const lines = readFileSync(`${root}${file}`, 'utf8').split('\n');
    lines.forEach((line, i) => {
      for (const m of line.matchAll(pattern)) {
        if (!accept(m[1])) continue;
        let rest = line.slice((m.index ?? 0) + m[0].length);
        for (let j = i + 1; j < Math.min(lines.length, i + 8) && !rest.includes('}'); j++) rest += `\n${lines[j]}`;
        if (!want.test(line) && !want.test(rest.split('}')[0])) missing.push(`${file}:${i + 1}  border-radius: ${m[1].trim()}`);
      }
    });
  }
  return missing;
}

describe('corner shape', () => {
  it('the squircle default is scoped to full-screen routes, and the Tailwind full-radius override exists', () => {
    const css = readCss(`${root}app/globals.css`);
    expect(css).toMatch(
      /@supports \(corner-shape: squircle\)\s*\{\s*html\.app-route \*,\s*html\.app-route ::before,\s*html\.app-route ::after\s*\{\s*corner-shape: squircle;/,
    );
    // Steel's site tier carries no squircle: the unscoped universal rule is gone.
    expect(css).not.toMatch(/@supports \(corner-shape: squircle\)\s*\{\s*\*,/);
    expect(css).toMatch(/@utility rounded-full\s*\{\s*corner-shape: round;/);
    expect(css).toMatch(/@utility rounded-t-full\s*\{\s*corner-shape: round;/);
  });

  it('every circle or pill border-radius declares corner-shape: round in the same rule', () => {
    const missing: string[] = [];
    for (const file of cssFiles) {
      const lines = readFileSync(`${root}${file}`, 'utf8').split('\n');
      lines.forEach((line, i) => {
        for (const m of line.matchAll(/border-radius:\s*([^;{}]+);/g)) {
          if (!isCircle(m[1])) continue;
          const sameLine = line.includes('corner-shape');
          let ruleRest = line.slice((m.index ?? 0) + m[0].length);
          for (let j = i + 1; j < Math.min(lines.length, i + 8) && !ruleRest.includes('}'); j++) {
            ruleRest += `\n${lines[j]}`;
          }
          const inRule = /corner-shape:\s*round/.test(ruleRest.split('}')[0]);
          if (!sameLine && !inRule) missing.push(`${file}:${i + 1}  border-radius: ${m[1].trim()}`);
        }
      });
    }
    expect(missing, `add \`corner-shape: round;\` beside:\n${missing.join('\n')}`).toEqual([]);
  });

  it('every `border-radius: inherit` also inherits the corner shape', () => {
    const missing = missingNextTo(/border-radius:\s*([^;{}]+);/g, /corner-shape:\s*inherit/, (v) => v.trim() === 'inherit');
    expect(missing, `add \`corner-shape: inherit;\` beside:\n${missing.join('\n')}`).toEqual([]);
  });

  it('the universal rule keeps pseudo-elements on their host shape, controls as capsules and the toast close round', () => {
    const css = readCss(`${root}app/globals.css`);
    expect(css).toMatch(/html\.app-route ::before,\s*html\.app-route ::after\s*\{\s*corner-shape: inherit;/);
    expect(css).toMatch(
      /\[data-slot='button'\][\s\S]*?html\.app-route \[data-sonner-toast\] \[data-close-button\]\s*\{\s*corner-shape: round;/,
    );
  });
});
