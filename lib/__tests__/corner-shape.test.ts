import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Corner shape (see the "Corner shape" note in app/globals.css `@layer base`): every rounded corner is a squircle
 * where `corner-shape` is supported, and circles and pills stay circular. A circle is any `border-radius` that is 50% /
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
  it('the universal squircle default and the Tailwind full-radius override exist', () => {
    const css = readFileSync(`${root}app/globals.css`, 'utf8');
    expect(css).toMatch(/@supports \(corner-shape: squircle\)\s*\{\s*\*,\s*::before,\s*::after\s*\{\s*corner-shape: squircle;/);
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
    const css = readFileSync(`${root}app/globals.css`, 'utf8');
    expect(css).toMatch(/::before,\s*::after\s*\{\s*corner-shape: inherit;/);
    expect(css).toMatch(/\[data-slot='button'\][\s\S]*?\[data-sonner-toast\] \[data-close-button\]\s*\{\s*corner-shape: round;/);
  });
});
