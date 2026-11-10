/**
 * TypeScript escape hatches only go DOWN (redesign audit A7).
 *
 * `: any`, `as any`, `@ts-ignore`, `@ts-expect-error` and `@ts-nocheck` each
 * switch the compiler off for a span of code. One-directional ratchet, like
 * `raw-api-fetch-ratchet.test.ts`:
 *  - a count above its baseline fails — type the value (`unknown` + narrowing,
 *    a zod schema, a generic) instead;
 *  - a count below fails until the baseline is lowered, so the freed room
 *    cannot quietly fill back up.
 *
 * The 26 `@ts-nocheck` files are all `components/velum2099/game/` (imported
 * dynamically by the page, so a tsconfig `exclude` cannot quarantine them).
 * Tests and `__tests__` are not counted.
 */
import { globSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/** Lower these when you remove escape hatches. Never raise them. */
const BASELINE = {
  colonAny: 130,
  asAny: 70,
  tsIgnore: 1,
  tsExpectError: 3,
  tsNocheck: 26,
};
type Key = keyof typeof BASELINE;

const PATTERNS: Record<Key, RegExp> = {
  colonAny: /:\s*any\b/g,
  asAny: /\bas\s+any\b/g,
  tsIgnore: /@ts-ignore\b/g,
  tsExpectError: /@ts-expect-error\b/g,
  tsNocheck: /@ts-nocheck\b/g,
};

const KEYS = Object.keys(BASELINE) as Key[];

function count(): Record<Key, number> {
  const files = globSync('{app,components,lib,server,hooks,stores}/**/*.{ts,tsx}', {
    exclude: (f) => /node_modules|__tests__|\.test\.|routeTree\.gen|generated/.test(String(f)),
  });
  const totals: Record<Key, number> = { colonAny: 0, asAny: 0, tsIgnore: 0, tsExpectError: 0, tsNocheck: 0 };
  for (const f of files) {
    const src = readFileSync(f, 'utf8');
    // `: any` / `as any` are counted in CODE only: prose in a comment ("…: any
    // colour value") is not an escape hatch. The @ts-* directives live in
    // comments by nature, so they are counted on the raw source.
    const code = src
      .split('\n')
      .filter((line) => !/^\s*(\/\/|\/\*|\*)/.test(line))
      .map((line) => line.replace(/\s\/\/.*$/, ''))
      .join('\n');
    for (const k of KEYS) {
      const text = k === 'colonAny' || k === 'asAny' ? code : src;
      totals[k] += (text.match(PATTERNS[k]) ?? []).length;
    }
  }
  return totals;
}

describe('TypeScript escape-hatch ratchet', () => {
  it('does not grow and is lowered as it shrinks', () => {
    const now = count();
    const grew = KEYS.filter((k) => now[k] > BASELINE[k]);
    const shrank = KEYS.filter((k) => now[k] < BASELINE[k]);
    expect(
      { grew, shrank },
      `${KEYS.map((k) => `${k}: ${now[k]} (baseline ${BASELINE[k]})`).join('\n')}\n` +
        (grew.length
          ? '  A new escape hatch: type the value (unknown + narrowing, a zod schema, a generic).\n'
          : '  You removed some: lower BASELINE in this file to the current counts.\n'),
    ).toEqual({ grew: [], shrank: [] });
  });
});
